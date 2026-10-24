// Googles MediaPipe wird erst geladen, wenn es gebraucht wird (Kamera an).
// Versionen sind fest gepinnt; der Service Worker hält die Dateien danach offline vor.
import { video, bildBereit } from './kamera.js';
import { bewegung } from './bewegung.js';
import { S } from './einstellungen.js';

// Restlichtverstärker für die KI-Erkennung: im Dunkeln wird ein aufgehelltes,
// kontrastverstärktes Bild statt des Rohvideos übergeben.
const hell = document.createElement('canvas');
const hctx = hell.getContext('2d');
const filterGeht = 'filter' in hctx;
function eingangsbild() {
  const v = bewegung.verstaerkung;
  if (!S.nachtsicht || !filterGeht || v < 1.3 || !video.videoWidth) return video;
  if (hell.width !== video.videoWidth) { hell.width = video.videoWidth; hell.height = video.videoHeight; }
  hctx.filter = `brightness(${v.toFixed(2)}) contrast(1.2)`;
  hctx.drawImage(video, 0, 0);
  return hell;
}

const VERSION = '0.10.21';
const BASIS = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODELLE = 'https://storage.googleapis.com/mediapipe-models';
const GESTEN_MODELL = `${MODELLE}/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task`;
const POSE_MODELL = `${MODELLE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`;

let basisPromise = null;
function basisLaden() {
  basisPromise ??= (async () => {
    const mp = await import(`${BASIS}/vision_bundle.mjs`);
    const dateien = await mp.FilesetResolver.forVisionTasks(`${BASIS}/wasm`);
    return { mp, dateien };
  })().catch(e => { basisPromise = null; throw e; });   // später neu versuchen dürfen
  return basisPromise;
}

/** Erst GPU, bei Fehlern CPU */
async function erzeugen(Klasse, dateien, optionen) {
  try { return await Klasse.createFromOptions(dateien, { ...optionen, baseOptions: { ...optionen.baseOptions, delegate: 'GPU' } }); }
  catch { return await Klasse.createFromOptions(dateien, { ...optionen, baseOptions: { ...optionen.baseOptions, delegate: 'CPU' } }); }
}

/** Monoton steigende Zeitstempel je Aufgabe (Pflicht für den VIDEO-Modus) */
const zeitstempel = () => { let letzt = 0; return () => (letzt = Math.max(performance.now(), letzt + 1)); };

// ---------------- Gesten: Peace-Zeichen ----------------
let gestenGestartet = false;

/**
 * Startet die Gestenerkennung. darf() entscheidet, ob gerade geprüft wird;
 * beiPeace() wird gerufen, wenn das Peace-Zeichen ca. eine halbe Sekunde gezeigt wurde.
 */
export async function gestenStarten(darf, beiPeace) {
  if (gestenGestartet) return;
  gestenGestartet = true;
  try {
    const { mp, dateien } = await basisLaden();
    const erkenner = await erzeugen(mp.GestureRecognizer, dateien, {
      baseOptions: { modelAssetPath: GESTEN_MODELL },
      runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
    });
    const ts = zeitstempel();
    let zaehler = 0;
    const schleife = () => {
      try {
        if (bildBereit() && darf()) {
          const r = erkenner.recognizeForVideo(eingangsbild(), ts());
          const peace = (r.gestures || []).some(g => g[0]?.categoryName === 'Victory' && g[0].score > 0.6);
          zaehler = peace ? zaehler + 1 : Math.max(0, zaehler - 1);
          if (zaehler >= 3) { zaehler = 0; beiPeace(); }
        } else zaehler = 0;
      } catch (e) { console.warn(e); }
      setTimeout(schleife, 180);
    };
    schleife();
  } catch (e) {
    gestenGestartet = false;
    console.warn('Gestenerkennung nicht verfügbar:', e);
  }
}

// ---------------- Körper (Pose) ----------------
export async function poseErzeugen(anzahl) {
  const { mp, dateien } = await basisLaden();
  const lm = await erzeugen(mp.PoseLandmarker, dateien, {
    baseOptions: { modelAssetPath: POSE_MODELL },
    runningMode: 'VIDEO', numPoses: anzahl,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5
  });
  const ts = zeitstempel();
  return {
    erkennen: () => lm.detectForVideo(eingangsbild(), ts()).landmarks || [],
    anzahlSetzen: n => lm.setOptions({ numPoses: n }).catch(() => {})
  };
}
