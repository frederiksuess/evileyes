# Feueraugen

Eine Web-App für Handy, Tablet und PC. Eine Kreatur folgt jeder Bewegung vor der Frontkamera.

| Motiv | Was passiert |
|---|---|
| **Schuppen / Rauch** | Feueraugen schauen dich an, blinzeln, kneifen sich zusammen, wenn du näher kommst, und ihre Schlitzpupillen werden schmal. |
| **Skelett** | Ein Skelett macht deine Bewegungen nach (bis zu 3 Personen). |
| **Vogelspinne** | Sie lauert im Dunkeln in einer Ecke ihres Netzes. Taucht jemand auf, sprintet sie blitzschnell hinterher – in Schüben – und richtet sich drohend auf, wenn man ihr zu nahe kommt. |

**Easter Egg:** Ein Peace-Zeichen in die Kamera (oder 1,6 s auf den Bildschirm drücken) startet die *Spinnenjagd*: 30 Sekunden lang Spinnen patschen.

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

- **Antippen:** Einstellungen öffnen (Motiv, Größe, Höhe, Empfindlichkeit, Spiegeln, mehrere Personen, Kamerabild)
- **Ziehen:** Blick bzw. Spinne mit dem Finger führen
- **Zwei Finger:** zoomen und verschieben
- **Doppelt tippen:** blinzeln (Augen)
- **Gedrückt halten (1,6 s)** oder **Peace-Zeichen:** Spinnenjagd
- Am PC: Mausrad zoomt, `Leertaste` = Einstellungen, `B` = blinzeln, `F` = Vollbild

## Aufbau

```
index.html              Gerüst
css/style.css           Gestaltung (Schriften liegen lokal in assets/fonts)
js/main.js              Einstieg, Hauptschleife, Szenenwechsel
js/einstellungen.js     gespeicherte Einstellungen (geprüft und begrenzt)
js/kamera.js            Frontkamera
js/bewegung.js          Bewegungserkennung, Personen-Klumpen, Spuren
js/aufmerksamkeit.js    wen die Kreatur gerade anschaut (bewusst träge)
js/mediapipe.js         lädt Googles MediaPipe bei Bedarf (Peace-Geste, Körper)
js/ui.js                Startbildschirm, Einstellungen, Berührungsgesten
js/vorschau.js          Kameravorschau zum Einrichten
js/hinweis.js, audio.js Meldungen, synthetische Klänge
js/szenen/augen.js      Feueraugen (Iris, Pupille, Lider)
js/szenen/skelett.js    Skelett
js/szenen/vogelspinne.js Vogelspinne mit Netz, Beinen per inverser Kinematik
js/spiel/spinnenjagd.js Easter Egg
sw.js                   Service Worker (offline)
tools/assets_bauen.py   erzeugt die Bildebenen der Augen aus quellen/*.jpg
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

Nur für Skelett und Peace-Geste lädt die App einmalig Programmcode von jsDelivr und Modelle von Google (storage.googleapis.com). Dabei sehen diese Dienste die IP-Adresse. Wer das vermeiden will, kann `@mediapipe/tasks-vision` (Version siehe `js/mediapipe.js`) und die beiden `.task`-Modelle ins Repository legen und die Pfade in `js/mediapipe.js` anpassen.

## Lizenzen

- Schriften: Grenze Gotisch und Alegreya Sans, SIL Open Font License (siehe `assets/fonts/`)
- MediaPipe: Apache 2.0 (Google)
