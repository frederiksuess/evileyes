// Relay-Kanal für die Fernbedienung über öffentliche MQTT-Broker (WebSocket, verschlüsselt).
//
// Warum? Die direkte WebRTC-Verbindung scheitert in manchen Netzen (Gast-WLAN mit
// Geräte-Isolation, mobile Daten, strenge Router). Befehle der Fernbedienung sind winzig –
// die können problemlos über einen Vermittler laufen. Wir nutzen zwei unabhängige Broker
// gleichzeitig; doppelt ankommende Nachrichten werden über ihre Kennung aussortiert.
//
// Das Thema enthält die zufällige Laptop-Kennung (feueraugen-…). Wer sie nicht kennt,
// findet den Kanal nicht. Bitte trotzdem nichts Vertrauliches als Botschaft senden.

const STANDARD_BROKER = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];

/** Broker-Liste; zum Testen oder für einen eigenen Broker: ?relay=wss://host:port/pfad (mehrere mit Komma) */
function brokerListe() {
  const p = new URLSearchParams(location.search).get('relay');
  return p ? p.split(',').map(s => s.trim()).filter(Boolean) : STANDARD_BROKER;
}

let bibliothek = null;
function mqttLaden() {
  bibliothek ??= import('./extern/mqtt-5.10.1.esm.js')
    .then(m => (m.default?.connect ? m.default : m.default?.default ?? m))
    .catch(e => { bibliothek = null; throw e; });
  return bibliothek;
}

const zufall = () => Math.random().toString(36).slice(2, 10);

/**
 * Mit allen Brokern verbinden.
 * @param {string} abo   Thema, auf das wir hören
 * @param {(daten:object)=>void} beiNachricht
 * @param {(anzahlVerbunden:number)=>void} [beiStatus]
 * @returns {{ senden(thema:string, daten:object):void, verbunden():number, beenden():void }}
 */
export async function relayVerbinden(abo, beiNachricht, beiStatus) {
  const mqtt = await mqttLaden();
  const clients = brokerListe().map(url => {
    const c = mqtt.connect(url, {
      clientId: 'feueraugen-' + zufall(), clean: true, keepalive: 30,
      connectTimeout: 8000, reconnectPeriod: 4000, protocolVersion: 4
    });
    c.on('connect', () => { c.subscribe(abo, { qos: 0 }); melden(); });
    c.on('close', melden);
    c.on('offline', melden);
    c.on('error', e => console.warn('Relay', url, e?.message || e));
    c.on('message', (_thema, roh) => {
      try {
        const d = JSON.parse(new TextDecoder().decode(roh));
        if (d && typeof d === 'object') beiNachricht(d);
      } catch { /* kaputte Nachricht ignorieren */ }
    });
    return c;
  });
  const verbunden = () => clients.filter(c => c.connected).length;
  function melden() { beiStatus?.(verbunden()); }
  return {
    senden(thema, daten) {
      const text = JSON.stringify(daten);
      for (const c of clients) if (c.connected) c.publish(thema, text, { qos: 0 });
    },
    verbunden,
    beenden() { clients.forEach(c => c.end(true)); }
  };
}

/** Themen für eine Laptop-Kennung */
export const relayThemen = id => ({ zumPortal: `feueraugen/v1/${id}/an`, vomPortal: `feueraugen/v1/${id}/von` });
