# Feueraugen

Eine Web-App für Handy, Tablet und PC. Eine Kreatur folgt jeder Bewegung vor der Frontkamera.

| Motiv | Was passiert |
|---|---|
| **Schuppen / Rauch** | Feueraugen schauen dich an, blinzeln, kneifen sich zusammen, wenn du näher kommst, und ihre Schlitzpupillen werden schmal. |
| **Skelett** | Ein Skelett macht deine Bewegungen nach (bis zu 3 Personen). |
| **Röntgen** | Röntgenspiegel: Das Portal zeigt die Gäste selbst als geisterhaftes Röntgenbild, darüber leuchtet ihr Skelett, das jede Bewegung mitmacht. Braucht etwas Licht auf den Gästen. |
| **Vogelspinne** | Sie lauert im Dunkeln in einer Ecke ihres Netzes. Taucht jemand auf, sprintet sie blitzschnell hinterher – in Schüben – und richtet sich drohend auf, wenn man ihr zu nahe kommt. |

**Easter Egg:** Winken oder ein Peace-Zeichen in die Kamera (oder 1,6 s auf den Bildschirm drücken, außer bei der Vogelspinne) startet die *Spinnenjagd*: 30 Sekunden lang Spinnen patschen. Winken funktioniert auch im Dunkeln, das Peace-Zeichen braucht Licht.

## Als Portal-Deko mit Beamer (Linux-Laptop)

1. **Portal anpassen:** Einstellungen öffnen (Leertaste oder antippen) → *Portal anpassen* (oder Taste `P`). Eine Vorlage wählen (Oval, Kreis, Torbogen, Rechteck) und die Punkte mit der Maus auf den Rand des Portals auf der Leinwand ziehen. Mit *Symmetrisch* bewegt sich der Spiegelpunkt mit. Innen ziehen verschiebt die Form, das Mausrad ändert die Größe, Doppelklick auf einen Punkt macht ihn eckig oder rund. Außerhalb bleibt alles schwarz, der Beamer wirft dort also kein Licht. *Rand weich* blendet den Übergang aus, *Glühender Rand* lässt die Kante glimmen.
2. **Wenig Licht:** Der *Restlichtverstärker* (Standard: an) hellt dunkle Kamerabilder auf und passt die Erkennung an das Bildrauschen an. Unter *Kamerabild* siehst du, wie hell die Kamera es sieht und wie stark aufgehellt wird. Als Auslöser für die Spinnenjagd im Dunkeln *Winken* wählen.
3. **Störquellen ausblenden:** Sieht die Kamera die Leinwand, ein Fenster oder flackerndes Licht, hält sie das für Bewegung – die Kreatur folgt dann sich selbst. Unter *Bereiche ausblenden* zieht man Rechtecke über solche Stellen. Unter *Kamerabild* sieht man live, was als Bewegung erkannt wird (orange).
4. **Rückprojektion:** Den Beamer auf „Rückprojektion“ stellen. Schauen die Augen in die falsche Richtung, hilft der Knopf *Spiegeln*.
5. **Dauerbetrieb:** Mit `?auto` an der Adresse startet die App ohne Startbildschirm mit der zuletzt genutzten Kamera. `tools/linux-kiosk.sh` richtet den Laptop so ein, dass er nach dem Anmelden direkt im Vollbild startet und nicht einschläft:
   ```bash
   bash tools/linux-kiosk.sh https://<name>.github.io/<repo>/
   ```
   Einmalig die Seite normal öffnen und die Kamera mit „Erlaubnis merken“ freigeben.

### Fernbedienung (für die Party)

Einstellungen → *Party* → *Fernbedienung koppeln*, QR-Code mit dem eigenen Handy scannen. Danach lässt sich das Portal unbemerkt aus der Tasche steuern:

- **Schreck!** – die Augen reißen auf und glühen, die Vogelspinne springt nach vorn und richtet sich drohend auf, Skelette reißen die Kiefer auf; dazu ein tiefes Grollen
- **Grollen**, **Blitz & Donner**, **Blinzeln**
- **Blick lenken** – Finger aufs Feld, die Kreatur schaut (bzw. die Spinne läuft) dorthin, z. B. zum Geburtstagskind
- **Botschaft** – Name eingeben und z. B. „Ich habe auf dich gewartet, Lena …“ erscheint in Flammenschrift im Portal; auch eigener Text
- **Motiv** wechseln und die **Spinnenjagd** starten

Die Kopplung bleibt gespeichert: Nach einem Neustart verbindet sich die Fernbedienung von selbst wieder. Kamera-Handy und Fernbedienung können gleichzeitig verbunden sein. Für Grollen und Donner einen (Bluetooth-)Lautsprecher hinter die Leinwand stellen – Ton macht beim Erschrecken den größten Unterschied.

### Handy als Kamera

Ein Handy liefert oft ein besseres Bild als eine einfache Webcam, besonders mit der Rückkamera und bei wenig Licht. Und es lässt sich besser verstecken.

1. Am Laptop: Startbildschirm → *Handy als Kamera*, oder in den Einstellungen unter *Kamera* „Handy als Kamera …“ wählen. Es erscheint ein QR-Code.
2. Das Handy scannt ihn, öffnet die Kamera-Seite und tippt *Kamera starten*. Dort lässt sich zwischen Rück- und Frontkamera wechseln. Mit *Bildschirm abdunkeln* leuchtet das Handy im Versteck nicht.
3. Fällt die Verbindung aus (WLAN, Neustart einer Seite), verbinden sich beide automatisch neu. Die Kennung des Laptops bleibt gleich, der QR-Code muss also nur einmal gescannt werden.

Technik: WebRTC über [PeerJS](https://peerjs.com). Der kostenlose PeerJS-Server vermittelt nur den Verbindungsaufbau, das Video fließt direkt im WLAN von Gerät zu Gerät. Beide Geräte brauchen daher Internet. Ein eigener Vermittler geht auch (`npx peer --port 9000`, dann die Seite mit `?peer=host:port` öffnen). Da GitHub Pages über HTTPS läuft, braucht dieser dann allerdings ebenfalls HTTPS.

## Veröffentlichen auf GitHub Pages

1. Den Inhalt dieses Ordners in ein Repository legen (Wurzel des Repos oder Ordner `docs/`).
2. Auf GitHub unter **Settings → Pages** bei **Source** „Deploy from a branch“ wählen, den Branch (z. B. `main`) und den Ordner (`/` oder `/docs`) angeben.
3. Nach einer Minute läuft die App unter `https://<name>.github.io/<repo>/`.

Die Datei `.nojekyll` sorgt dafür, dass GitHub die Dateien unverändert ausliefert. Alle Pfade sind relativ, die App funktioniert also auch in einem Unterordner.

Auf dem Handy kann man die Seite über „Zum Home-Bildschirm hinzufügen“ wie eine App installieren. Sie startet dann im Vollbild und funktioniert nach dem ersten Besuch auch offline. Nur Skelett und Peace-Erkennung brauchen beim allerersten Mal Internet.

## Lokal ausprobieren

ES-Module und Kamera funktionieren nicht über `file://`. Deshalb einen kleinen Server starten:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Mit `?debug` an der Adresse (z. B. `http://localhost:8000/?debug`) steht in der Browser-Konsole `feueraugen` zum Ausprobieren bereit.

## Bedienung

- **Antippen:** Einstellungen öffnen (Motiv, Kamera, Portal, Größe, Höhe, Empfindlichkeit, Auslöser …)
- **Ziehen:** Blick bzw. Spinne mit dem Finger führen
- **Zwei Finger:** zoomen und verschieben
- **Doppelt tippen:** blinzeln (Augen)
- **Gedrückt halten (1,6 s)** oder **Peace-Zeichen:** Spinnenjagd (bei der Vogelspinne nur per Peace-Zeichen – dort lockt ein ruhiger Finger die Spinne an)
- Am PC: Mausrad zoomt, `Leertaste` = Einstellungen, `P` = Portal anpassen, `B` = blinzeln, `F` = Vollbild, `Esc` = schließen

## Aufbau

```
index.html              Gerüst
css/style.css           Gestaltung (Schriften liegen lokal in assets/fonts)
js/main.js              Einstieg, Hauptschleife, Szenenwechsel
js/einstellungen.js     gespeicherte Einstellungen (geprüft und begrenzt)
js/kamera.js            Frontkamera
js/bewegung.js          Bewegungserkennung, Personen-Klumpen, Spuren, Restlichtverstärker
js/winken.js            Winken erkennen (lichtunabhängig)
js/portal.js            Portal-Form, Maske und Editor
js/fernkamera.js        Handy als Kamera: Empfänger (WebRTC/PeerJS) und QR-Code
js/sender.js            Handy-Seite (sender.html), schickt das Kamerabild
js/extern/              PeerJS 1.5.5 und qrcode-generator 2.0.4 (beide MIT)
js/aufmerksamkeit.js    wen die Kreatur gerade anschaut (bewusst träge)
js/mediapipe.js         lädt Googles MediaPipe bei Bedarf (Peace-Geste, Körper)
js/ui.js                Startbildschirm, Einstellungen, Berührungsgesten
js/vorschau.js          Kameravorschau zum Einrichten
js/hinweis.js, audio.js Meldungen, synthetische Klänge
js/szenen/augen.js      Feueraugen (Iris, Pupille, Lider)
js/szenen/skelett.js    Skelett
js/szenen/vogelspinne.js Vogelspinne mit Netz, Beinen per inverser Kinematik
js/szenen/roentgen.js   Röntgenspiegel (Kamerabild + Skelett)
js/fernbedienung.js     Fernbedienungs-Seite fürs Handy (fernbedienung.html)
js/spiel/spinnenjagd.js Easter Egg
sw.js                   Service Worker (offline)
tools/assets_bauen.py   erzeugt die Bildebenen der Augen aus quellen/*.jpg
tools/linux-kiosk.sh    Laptop als Dauer-Portal einrichten (Autostart, kein Energiesparen)
```

Jede Szene ist eine Klasse mit `laden()` und `zeichne(ctx, t, dt, eingabe)`. Optional gibt es `aktivieren()`, `deaktivieren()`, `blinzeln()`, `kameraGestartet()` und `patschPunkte()`. Eine neue Szene braucht einen Eintrag in `MOTIV_IDS` (`einstellungen.js`), einen Knopf in `index.html` und eine Zeile in `szenenAnlegen()` (`main.js`).

### Neues Augen-Motiv hinzufügen

1. Bild nach `quellen/` legen.
2. In `tools/assets_bauen.py` bei `MOTIVE` die Lage von Iris und Augenöffnung eintragen.
3. Das Skript ausführen:
   ```bash
   pip install opencv-python-headless numpy
   python3 tools/assets_bauen.py
   ```
4. Einen Eintrag in `MOTIV_IDS` und einen Knopf in `index.html` ergänzen.

## Datenschutz

Das Kamerabild wird **ausschließlich im Browser** verarbeitet und nirgends hochgeladen. Schriften liegen im Projekt.

Für „Handy als Kamera“ läuft der Verbindungsaufbau über den PeerJS-Server (nur Verbindungsdaten, kein Video). Nur für Skelett und Peace-Geste lädt die App einmalig Programmcode von jsDelivr und Modelle von Google (storage.googleapis.com). Dabei sehen diese Dienste die IP-Adresse. Wer das vermeiden will, kann `@mediapipe/tasks-vision` (Version siehe `js/mediapipe.js`) und die beiden `.task`-Modelle ins Repository legen und die Pfade in `js/mediapipe.js` anpassen.

## Lizenzen

- Schriften: Grenze Gotisch und Alegreya Sans, SIL Open Font License (siehe `assets/fonts/`)
- MediaPipe: Apache 2.0 (Google)
- PeerJS und qrcode-generator: MIT (siehe `js/extern/`)
