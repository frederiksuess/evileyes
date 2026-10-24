// Kamera-Quelle. Das Video-Element ist versteckt; Bewegungs-, Gesten- und Körpererkennung
// lesen daraus. Die Quelle kann eine Kamera dieses Geräts sein oder ein Handy (WebRTC).
import { S, speichern } from './einstellungen.js';

export const video = document.getElementById('video');
export const kamera = { laeuft: false, quelle: null };   // quelle: 'lokal' | 'handy'
const beiStart = new Set();

/** Rückruf, sobald ein Bild da ist (erstesMal = true beim allerersten Start) */
export const wennKameraLaeuft = f => beiStart.add(f);

function streamStoppen() {
  const s = video.srcObject;
  if (s && kamera.quelle === 'lokal') s.getTracks().forEach(t => t.stop());
  video.srcObject = null;
}

async function abspielen(stream, quelle) {
  streamStoppen();
  video.srcObject = stream;
  await video.play().catch(() => {});
  kamera.quelle = quelle;
  const erstesMal = !kamera.laeuft;
  kamera.laeuft = true;
  for (const f of beiStart) f(erstesMal);
}

/** Wenig Licht: lieber weniger Bilder pro Sekunde, dafür länger belichten */
export const videoVorgaben = (extra = {}) => ({
  width: { ideal: 1280 }, height: { ideal: 720 },
  frameRate: S.nachtsicht ? { ideal: 20, max: 30 } : { ideal: 30 },
  ...extra
});

export async function kameraStarten(deviceId = S.kameraId) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const e = new Error('Kamera wird von diesem Browser nicht unterstützt');
    e.name = 'NotSupportedError';
    throw e;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: videoVorgaben(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }), audio: false
    });
  } catch (e) {
    if (!deviceId || e.name === 'NotAllowedError') throw e;
    // gespeicherte Kamera gibt es nicht mehr -> irgendeine nehmen
    stream = await navigator.mediaDevices.getUserMedia({ video: videoVorgaben({ facingMode: 'user' }), audio: false });
  }
  const id = stream.getVideoTracks()[0]?.getSettings().deviceId;
  if (id) { S.kameraId = id; speichern(); }
  await abspielen(stream, 'lokal');
}

/** Stream von außen übernehmen (Handy-Kamera) */
export const fremdenStreamSetzen = stream => abspielen(stream, 'handy');

/** Alle Kameras dieses Geräts (Namen erst nach erteilter Erlaubnis) */
export async function kameraListe() {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  } catch { return []; }
}

/** Seitenverhältnis des Kamerabilds (Breite, Höhe); vor dem Start ein Hochformat-Standard */
export const videoGroesse = () => [video.videoWidth || 480, video.videoHeight || 640];

export const bildBereit = () => kamera.laeuft && video.readyState >= 2 && !document.hidden;
