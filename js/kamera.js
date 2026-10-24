// Frontkamera öffnen. Das Video-Element ist versteckt; Bewegungs-, Gesten- und
// Körpererkennung lesen ihre Bilder daraus.

export const video = document.getElementById('video');
export const kamera = { laeuft: false };

export async function kameraStarten() {
  if (!navigator.mediaDevices?.getUserMedia) {
    const e = new Error('Kamera wird von diesem Browser nicht unterstützt');
    e.name = 'NotSupportedError';
    throw e;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    audio: false
  });
  video.srcObject = stream;
  await video.play().catch(() => {});
  kamera.laeuft = true;
}

/** Seitenverhältnis des Kamerabilds (Breite, Höhe); vor dem Start ein Hochformat-Standard */
export const videoGroesse = () => [video.videoWidth || 480, video.videoHeight || 640];

export const bildBereit = () => kamera.laeuft && video.readyState >= 2 && !document.hidden;
