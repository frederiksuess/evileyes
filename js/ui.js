// Bedienoberfläche: Startbildschirm, Einstellungen, Portal-Editor, Handy-Dialog und Berührungen.
// Die eigentliche Logik steckt in main.js und wird über „aktionen“ hereingereicht.
import { S, speichern, ansicht } from './einstellungen.js';
import { klemm } from './util.js';
import { spielAktiv, patschBei } from './spiel/spinnenjagd.js';
import { vorschauSchalten } from './vorschau.js';
import { kamera } from './kamera.js';
import { zeige } from './hinweis.js';
import { klangFreischalten } from './audio.js';
import {
  portal, zuBuehne, editorRunter, editorZiehen, editorHoch, editorDoppel, editorSkalieren,
  vorlageSetzen, weichSetzen, portalSchalten, glutSchalten
} from './portal.js';

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
  if (an) leisteTimer = setTimeout(() => leisteZeigen(false), 12000);
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

/** Segment-Knöpfe (eine Auswahl aus mehreren) */
function segment(attr, wert, beiWahl) {
  const knoepfe = [...document.querySelectorAll(`[data-${attr}]`)];
  const anzeigen = () => knoepfe.forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === wert())));
  knoepfe.forEach(b => b.addEventListener('click', () => { beiWahl(b.dataset[attr]); anzeigen(); }));
  anzeigen();
  return anzeigen;
}

/** An/Aus-Knopf für einen Wert in S */
function schalter(id, schluessel, textAn, textAus, danach) {
  const b = $(id);
  b.setAttribute('aria-pressed', String(S[schluessel]));
  b.addEventListener('click', () => {
    S[schluessel] = !S[schluessel];
    b.setAttribute('aria-pressed', String(S[schluessel]));
    zeige(S[schluessel] ? textAn : textAus, 2200);
    speichern();
    danach?.();
  });
}

// ---------------- Kamera-Auswahl ----------------
const kameraWahl = $('kameraWahl');
export async function kameraWahlFuellen(liste) {
  const geraete = await liste();
  kameraWahl.replaceChildren();
  geraete.forEach((d, i) => kameraWahl.append(new Option(d.label || `Kamera ${i + 1}`, d.deviceId)));
  if (!geraete.length) kameraWahl.append(new Option('Kamera dieses Geräts', ''));
  kameraWahl.append(new Option('Handy als Kamera …', 'handy'));
  kameraWahl.value = kamera.quelle === 'handy' ? 'handy' : (geraete.some(d => d.deviceId === S.kameraId) ? S.kameraId : kameraWahl.options[0].value);
}

// ---------------- Handy-Dialog ----------------
const handyDialog = $('handyDialog');
export function handyDialogZeigen(adresse, svg) {
  $('qr').innerHTML = svg;
  $('qr').hidden = !svg;
  $('hdAdresse').textContent = adresse;
  handyDialog.hidden = false;
  leisteZeigen(false);
}
export function handyStatus(text, ok = false) {
  $('hdStatus').textContent = text;
  $('hdStatus').className = ok ? 'ok' : '';
}
export const handyDialogSchliessen = () => { handyDialog.hidden = true; };

// ---------------- Portal-Editor ----------------
const portalLeiste = $('portalLeiste');
function portalLeisteAnzeigen() {
  $('pSym').setAttribute('aria-pressed', String(portal.symmetrisch));
  $('pGlut').setAttribute('aria-pressed', String(S.portal.glut));
  $('pAn').setAttribute('aria-pressed', String(S.portal.an));
  $('pWeich').value = (S.portal.weich * 100).toFixed(1);
  $('oWeich').textContent = Math.round(S.portal.weich * 100);
}
export function portalEditor(an) {
  portal.bearbeiten = an;
  portalLeiste.hidden = !an;
  if (an) {
    if (!S.portal.an) portalSchalten(true);
    leisteZeigen(false);
    portalLeisteAnzeigen();
  }
}

export function uiEinrichten(aktionen) {
  // Startbildschirm
  const start = $('start');
  const los = async (art, automatisch = false) => {
    ui.gestartet = true;
    start.classList.add('weg');
    start.inert = true;
    await aktionen.starten(art, automatisch);
  };
  ui.automatischStarten = art => los(art, true);
  $('losKamera').addEventListener('click', () => los('lokal'));
  $('losHandy').addEventListener('click', () => los('handy'));
  $('losFinger').addEventListener('click', () => los('keine'));

  // Leiste offen halten, solange man darin arbeitet
  for (const ev of ['pointerdown', 'input', 'scroll', 'focusin', 'change'])
    leiste.addEventListener(ev, e => { e.stopPropagation(); leisteZeigen(true); }, { passive: true });
  leisteZeigen(false);

  segment('motiv', () => S.motiv, aktionen.motivWaehlen);
  segment('ausloeser', () => S.ausloeser, w => {
    S.ausloeser = w; speichern();
    zeige({ winken: 'Spinnenjagd: Winken (klappt auch im Dunkeln)', peace: 'Spinnenjagd: Peace-Zeichen (braucht Licht)',
            beide: 'Spinnenjagd: Winken oder Peace', aus: 'Spinnenjagd: nur per Gedrückthalten' }[w], 2600);
  });

  schalter('bMehrere', 'mehrere', 'Mehrere Personen: an', 'Mehrere Personen: aus', aktionen.mehrereGeaendert);
  schalter('bSpiegeln', 'spiegeln', 'Spiegeln an', 'Spiegeln aus');
  schalter('bNacht', 'nachtsicht', 'Restlichtverstärker an – hellt dunkle Kamerabilder auf', 'Restlichtverstärker aus');

  kameraWahl.addEventListener('change', () => {
    const v = kameraWahl.value;
    if (v === 'handy') aktionen.handyVerbinden();
    else aktionen.kameraWechseln(v);
  });

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
  $('bPortal').addEventListener('click', () => portalEditor(true));

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

  // Portal-Leiste
  document.querySelectorAll('[data-vorlage]').forEach(b => b.addEventListener('click', () => { vorlageSetzen(b.dataset.vorlage); portalLeisteAnzeigen(); }));
  $('pSym').addEventListener('click', () => { portal.symmetrisch = !portal.symmetrisch; portalLeisteAnzeigen(); });
  $('pGlut').addEventListener('click', () => { glutSchalten(!S.portal.glut); portalLeisteAnzeigen(); });
  $('pAn').addEventListener('click', () => { portalSchalten(!S.portal.an); portalLeisteAnzeigen(); });
  $('pWeich').addEventListener('input', () => { weichSetzen($('pWeich').value / 100); portalLeisteAnzeigen(); });
  $('pFertig').addEventListener('click', () => portalEditor(false));

  // Handy-Dialog
  $('hdSchliessen').addEventListener('click', handyDialogSchliessen);
  $('hdLokal').addEventListener('click', () => { handyDialogSchliessen(); aktionen.kameraWechseln(S.kameraId); });

  beruehrungEinrichten(aktionen);
}

async function vollbild() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (document.fullscreenElement) await document.exitFullscreen();
    else throw new Error();
  } catch { zeige('Vollbild ist hier nicht verfügbar. Tipp: F11 oder „Zum Home-Bildschirm hinzufügen“.', 3500); }
}

// ---------------- Berührungen ----------------
// ziehen = Blick/Spinne führen · tippen = Einstellungen · doppelt tippen = blinzeln
// zwei Finger = zoomen/verschieben · 1,6 s halten = Spinnenjagd · im Spiel: Spinnen patschen
// Im Portal-Editor gehen alle Zeiger an den Editor.
function beruehrungEinrichten(aktionen) {
  const zeiger = new Map();
  let down = null, pinch = null, pinchAktiv = false, halteTimer = null;
  let letzterTipp = 0, tippTimer = null;
  const halteAbbrechen = () => { clearTimeout(halteTimer); halteTimer = null; };
  const pinchDaten = () => {
    const [a, b] = [...zeiger.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), my: (a.y + b.y) / 2 };
  };

  buehne.addEventListener('contextmenu', e => e.preventDefault());
  buehne.addEventListener('pointerdown', e => {
    if (!ui.gestartet) return;
    klangFreischalten();               // nach einem Autostart erst beim ersten Antippen möglich
    const [bx, by] = zuBuehne(e.clientX, e.clientY);
    if (spielAktiv() && !portal.bearbeiten) { patschBei(...aktionen.zuSzene(bx, by)); return; }
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    buehne.setPointerCapture(e.pointerId);
    halteAbbrechen();
    if (zeiger.size === 2) {
      const p = pinchDaten();
      pinch = { d0: Math.max(20, p.d), dAlt: Math.max(20, p.d), y0: p.my, z0: ansicht().zoom, h0: ansicht().hoehe };
      pinchAktiv = true; down = null; ui.finger = null;
      editorHoch();
      return;
    }
    if (zeiger.size !== 1) return;
    down = { x: e.clientX, y: e.clientY, gezogen: false };
    if (portal.bearbeiten) { editorRunter(bx, by); return; }
    const sz = aktionen.szene();
    if (sz.fingerSofort) ui.finger = aktionen.zuSzene(bx, by);
    if (sz.halteStartetSpiel !== false) halteTimer = setTimeout(() => {
      if (down && !down.gezogen) { down = null; ui.finger = null; aktionen.spielStarten(); }
    }, 1600);
  });
  buehne.addEventListener('pointermove', e => {
    if (!zeiger.has(e.pointerId)) return;
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && zeiger.size >= 2) {
      const p = pinchDaten();
      if (portal.bearbeiten) { editorSkalieren(p.d / pinch.dAlt); pinch.dAlt = p.d; return; }
      setzeZoom(pinch.z0 * p.d / pinch.d0);
      if (!hoeheZeile.hidden) setzeHoehe(pinch.h0 + (p.my - pinch.y0) / (innerHeight * 0.35));
      return;
    }
    if (!down) return;
    const [bx, by] = zuBuehne(e.clientX, e.clientY);
    if (!down.gezogen && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down.gezogen = true; halteAbbrechen(); }
    if (portal.bearbeiten) { if (down.gezogen) editorZiehen(bx, by); return; }
    if (down.gezogen || aktionen.szene().fingerSofort) ui.finger = aktionen.zuSzene(bx, by);
  });
  const weg = (e, abgebrochen) => {
    zeiger.delete(e.pointerId);
    halteAbbrechen();
    if (pinchAktiv) {
      if (zeiger.size < 2) pinch = null;
      if (zeiger.size === 0) pinchAktiv = false;
      return;
    }
    if (portal.bearbeiten) {
      editorHoch();
      if (!abgebrochen && down && !down.gezogen) {
        const jetzt = performance.now();
        if (jetzt - letzterTipp < 320) { letzterTipp = 0; editorDoppel(...zuBuehne(e.clientX, e.clientY)); }
        else letzterTipp = jetzt;
      }
      down = null;
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
    if (portal.bearbeiten) editorSkalieren(Math.exp(-e.deltaY * 0.001));
    else setzeZoom(ansicht().zoom * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // Tastatur (Laptop): Leertaste = Einstellungen, P = Portal, B = blinzeln, F = Vollbild, Esc = fertig
  addEventListener('keydown', e => {
    if (!ui.gestartet || e.target.closest?.('input, select')) return;
    klangFreischalten();
    if (e.key === 'Escape' || (e.key === 'Enter' && portal.bearbeiten)) { portalEditor(false); handyDialogSchliessen(); leisteZeigen(false); }
    else if (e.key === ' ' && !e.target.closest?.('button')) { e.preventDefault(); leisteZeigen(!leisteOffen()); }
    else if (e.key === 'p') portalEditor(!portal.bearbeiten);
    else if (e.key === 'b') aktionen.blinzeln();
    else if (e.key === 'f') vollbild();
  });
}
