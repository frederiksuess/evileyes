// Bedienoberfläche: Startbildschirm, Einstellungsleiste, Regler und Berührungen.
// Die eigentliche Logik steckt in main.js und wird über „aktionen“ hereingereicht.
import { S, speichern, ansicht } from './einstellungen.js';
import { klemm } from './util.js';
import { spielAktiv, patschBei } from './spiel/spinnenjagd.js';
import { vorschauSchalten } from './vorschau.js';
import { kamera } from './kamera.js';
import { zeige } from './hinweis.js';

const $ = id => document.getElementById(id);
const leiste = $('leiste');
const buehne = $('buehne');

export const ui = { gestartet: false, finger: null };

// ---------------- Einstellungsleiste ----------------
let leisteTimer = null;
export function leisteZeigen(an) {
  leiste.classList.toggle('offen', an);
  leiste.inert = !an;                      // geschlossen: nicht per Tastatur/Screenreader erreichbar
  clearTimeout(leisteTimer);
  if (an) leisteTimer = setTimeout(() => leisteZeigen(false), 8000);
}
const leisteOffen = () => leiste.classList.contains('offen');

// ---------------- Regler ----------------
const rZoom = $('rZoom'), oZoom = $('oZoom'), rHoehe = $('rHoehe'), oHoehe = $('oHoehe');
const rEmpf = $('rEmpf'), oEmpf = $('oEmpf'), hoeheZeile = $('hoeheZeile');

export function ansichtAnzeigen(hatHoehe = true) {
  const a = ansicht();
  rZoom.value = Math.round(a.zoom * 100);
  oZoom.textContent = Math.round(a.zoom * 100) + ' %';
  rHoehe.value = Math.round(a.hoehe * 100);
  oHoehe.textContent = (a.hoehe > 0 ? '+' : '') + Math.round(a.hoehe * 100);
  hoeheZeile.hidden = !hatHoehe;
}
function setzeZoom(z) { ansicht().zoom = klemm(z, 0.5, 3); ansichtAnzeigen(!hoeheZeile.hidden); speichern(); }
function setzeHoehe(h) { ansicht().hoehe = klemm(h, -1, 1); ansichtAnzeigen(!hoeheZeile.hidden); speichern(); }

export function uiEinrichten(aktionen) {
  // Startbildschirm
  const start = $('start');
  const los = async mitKamera => {
    ui.gestartet = true;
    start.classList.add('weg');
    start.inert = true;
    await aktionen.starten(mitKamera);
  };
  $('losKamera').addEventListener('click', () => los(true));
  $('losFinger').addEventListener('click', () => los(false));

  // Leiste offen halten, solange man darin arbeitet
  for (const ev of ['pointerdown', 'input', 'scroll', 'focusin'])
    leiste.addEventListener(ev, e => { e.stopPropagation(); leisteZeigen(true); }, { passive: true });
  leisteZeigen(false);

  // Motivwahl
  const motivKnoepfe = [...document.querySelectorAll('[data-motiv]')];
  const motivAnzeigen = () => motivKnoepfe.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.motiv === S.motiv)));
  motivKnoepfe.forEach(b => b.addEventListener('click', () => { aktionen.motivWaehlen(b.dataset.motiv); motivAnzeigen(); }));
  motivAnzeigen();

  // Schalter
  const schalter = (id, schluessel, textAn, textAus, danach) => {
    const b = $(id);
    b.setAttribute('aria-pressed', String(S[schluessel]));
    b.addEventListener('click', () => {
      S[schluessel] = !S[schluessel];
      b.setAttribute('aria-pressed', String(S[schluessel]));
      zeige(S[schluessel] ? textAn : textAus, 1800);
      speichern();
      danach?.();
    });
  };
  schalter('bMehrere', 'mehrere', 'Mehrere Personen: an', 'Mehrere Personen: aus', aktionen.mehrereGeaendert);
  schalter('bSpiegeln', 'spiegeln', 'Spiegeln an', 'Spiegeln aus');

  const bVorschau = $('bVorschau');
  bVorschau.addEventListener('click', () => {
    const an = bVorschau.getAttribute('aria-pressed') !== 'true';
    bVorschau.setAttribute('aria-pressed', String(an));
    vorschauSchalten(an);
    if (an && !kamera.laeuft) zeige('Die Kamera ist nicht aktiv.', 2000);
  });
  $('bBlinzeln').addEventListener('click', aktionen.blinzeln);
  $('bNeu').addEventListener('click', () => { aktionen.neuLernen(); zeige('Kurz stillhalten …', 1800); });
  $('bVoll').addEventListener('click', vollbild);
  $('bReset').addEventListener('click', () => { setzeZoom(1); setzeHoehe(0); });

  rZoom.addEventListener('input', () => setzeZoom(rZoom.value / 100));
  rHoehe.addEventListener('input', () => setzeHoehe(rHoehe.value / 100));
  const setzeEmpf = v => {
    S.empf = klemm(Number(v), 6, 60);
    rEmpf.value = S.empf; oEmpf.textContent = S.empf;
    aktionen.empfindlichkeit(S.empf);
    speichern();
  };
  rEmpf.addEventListener('input', () => setzeEmpf(rEmpf.value));
  setzeEmpf(S.empf);

  beruehrungEinrichten(aktionen);
}

async function vollbild() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (document.fullscreenElement) await document.exitFullscreen();
    else throw new Error();
  } catch { zeige('Vollbild ist hier nicht verfügbar. Tipp: zum Home-Bildschirm hinzufügen.', 3500); }
}

// ---------------- Berührungen ----------------
// ziehen = Blick/Spinne führen · tippen = Einstellungen · doppelt tippen = blinzeln
// zwei Finger = zoomen/verschieben · 1,6 s halten = Spinnenjagd · im Spiel: Spinnen patschen
function beruehrungEinrichten(aktionen) {
  const zeiger = new Map();
  let down = null, pinch = null, pinchAktiv = false, halteTimer = null;
  let letzterTipp = 0, tippTimer = null;
  const dpr = () => buehne.width / innerWidth;
  const halteAbbrechen = () => { clearTimeout(halteTimer); halteTimer = null; };
  const pinchDaten = () => {
    const [a, b] = [...zeiger.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), my: (a.y + b.y) / 2 };
  };

  buehne.addEventListener('contextmenu', e => e.preventDefault());
  buehne.addEventListener('pointerdown', e => {
    if (!ui.gestartet) return;
    if (spielAktiv()) { patschBei(e.clientX * dpr(), e.clientY * dpr()); return; }
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    buehne.setPointerCapture(e.pointerId);
    halteAbbrechen();
    if (zeiger.size === 2) {
      const p = pinchDaten();
      pinch = { d0: Math.max(20, p.d), y0: p.my, z0: ansicht().zoom, h0: ansicht().hoehe };
      pinchAktiv = true; down = null; ui.finger = null;
    } else if (zeiger.size === 1) {
      down = { x: e.clientX, y: e.clientY, gezogen: false };
      halteTimer = setTimeout(() => {
        if (down && !down.gezogen) { down = null; ui.finger = null; aktionen.spielStarten(); }
      }, 1600);
    }
  });
  buehne.addEventListener('pointermove', e => {
    if (!zeiger.has(e.pointerId)) return;
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && zeiger.size >= 2) {
      const p = pinchDaten();
      setzeZoom(pinch.z0 * p.d / pinch.d0);
      if (!hoeheZeile.hidden) setzeHoehe(pinch.h0 + (p.my - pinch.y0) / (innerHeight * 0.35));
      return;
    }
    if (!down) return;
    if (!down.gezogen && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down.gezogen = true; halteAbbrechen(); }
    if (down.gezogen) ui.finger = [e.clientX * dpr(), e.clientY * dpr()];
  });
  const weg = (e, abgebrochen) => {
    zeiger.delete(e.pointerId);
    halteAbbrechen();
    if (pinchAktiv) {
      if (zeiger.size < 2) pinch = null;
      if (zeiger.size === 0) pinchAktiv = false;
      return;
    }
    if (!abgebrochen && down && !down.gezogen) {
      const jetzt = performance.now();
      if (jetzt - letzterTipp < 300) {
        clearTimeout(tippTimer);
        letzterTipp = 0;
        aktionen.blinzeln();
      } else {
        letzterTipp = jetzt;
        tippTimer = setTimeout(() => leisteZeigen(!leisteOffen()), 300);
      }
    }
    down = null; ui.finger = null;
  };
  buehne.addEventListener('pointerup', e => weg(e, false));
  buehne.addEventListener('pointercancel', e => weg(e, true));
  buehne.addEventListener('wheel', e => {
    e.preventDefault();
    setzeZoom(ansicht().zoom * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // Tastatur (Desktop): Leertaste = Einstellungen, B = blinzeln, F = Vollbild
  addEventListener('keydown', e => {
    if (!ui.gestartet || e.target.closest?.('input')) return;
    if (e.key === ' ' && !e.target.closest?.('button')) { e.preventDefault(); leisteZeigen(!leisteOffen()); }
    else if (e.key === 'b') aktionen.blinzeln();
    else if (e.key === 'f') vollbild();
  });
}

