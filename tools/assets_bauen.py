#!/usr/bin/env python3
"""
Erzeugt aus den Quellbildern (quellen/*.jpg) alle Bildebenen, die die Augen-Szenen brauchen,
sowie die App-Icons. Nur nötig, wenn ein Motiv dazukommt oder sich ändert.

    pip install opencv-python-headless numpy
    python3 tools/assets_bauen.py

Ergebnis:
    assets/augen/<id>/{bg.jpg, maske.png, lidmaske.png, schatten.png, iris0.png, iris1.png}
    assets/augen/motive.json     (Geometrie, wird von js/szenen/augen.js gelesen)
    assets/icons/*.png
"""
import json
from pathlib import Path

import cv2
import numpy as np

WURZEL = Path(__file__).resolve().parent.parent
QUELLEN = WURZEL / "quellen"
ZIEL = WURZEL / "assets" / "augen"
ICONS = WURZEL / "assets" / "icons"

# Geometrie je Motiv (Pixel im 572x1024-Quellbild):
#   iris    Mittelpunkt der Iris
#   socket  Mittelpunkt der sichtbaren Augenöffnung, achsen = Halbachsen, winkel in Grad
MOTIVE = [
    {
        "id": "schuppen", "name": "Schuppen", "quelle": "schuppen.jpg",
        "r": 46, "maxX": 27, "maxY": 7, "lidQuelle": "oben", "lidDunkel": 0.14,
        "augen": [
            {"iris": (142, 514), "socket": (145, 515), "achsen": (78, 43), "winkel": 7},
            {"iris": (428, 515), "socket": (425, 515), "achsen": (78, 43), "winkel": -7},
        ],
    },
    {
        "id": "rauch", "name": "Rauch", "quelle": "rauch.jpg",
        "r": 45, "maxX": 30, "maxY": 10, "lidQuelle": "unten", "lidDunkel": 0.18,
        "augen": [
            {"iris": (136, 511), "socket": (139, 513), "achsen": (84, 47), "winkel": -4},
            {"iris": (437, 511), "socket": (434, 513), "achsen": (84, 47), "winkel": 4},
        ],
    },
]


def alpha_png(pfad, a):
    h, w = a.shape
    m = np.zeros((h, w, 4), np.uint8)
    m[..., 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
    cv2.imwrite(str(pfad), m, [cv2.IMWRITE_PNG_COMPRESSION, 9])


def motiv_bauen(cfg):
    img = cv2.imread(str(QUELLEN / cfg["quelle"]))
    if img is None:
        raise SystemExit(f"Quellbild fehlt: {cfg['quelle']}")
    h, w = img.shape[:2]
    R = cfg["r"]
    ordner = ZIEL / cfg["id"]
    ordner.mkdir(parents=True, exist_ok=True)

    # 1) Iris entfernen -> leerer Augapfel als Hintergrund
    loch = np.zeros((h, w), np.uint8)
    for a in cfg["augen"]:
        cv2.circle(loch, a["iris"], R + 2, 255, -1)
    bg = cv2.inpaint(img, loch, 9, cv2.INPAINT_TELEA).astype(np.float32)
    rausch = np.random.default_rng(1).normal(0, 6, img.shape).astype(np.float32)
    lf = cv2.GaussianBlur(loch.astype(np.float32) / 255, (0, 0), 6)[..., None]
    bg = np.clip(bg * (1 - 0.18 * lf) + rausch * lf, 0, 255).astype(np.uint8)
    cv2.imwrite(str(ordner / "bg.jpg"), bg, [cv2.IMWRITE_JPEG_QUALITY, 90])

    # 2) Iris-Sprites mit weichem Rand + Lage des Pupillenschlitzes
    d = 2 * R + 1
    yy, xx = np.mgrid[0:d, 0:d]
    alpha = np.clip((R - np.hypot(xx - R, yy - R)) / 4.0, 0, 1)
    iris = []
    for i, a in enumerate(cfg["augen"]):
        cx, cy = a["iris"]
        patch = img[cy - R:cy + R + 1, cx - R:cx + R + 1]
        cv2.imwrite(str(ordner / f"iris{i}.png"), np.dstack([patch, (alpha * 255).astype(np.uint8)]))
        v = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)[..., 2]
        m = (v < 70).astype(np.uint8)
        m[np.hypot(xx - R, yy - R) > R - 3] = 0
        _, _, st, _ = cv2.connectedComponentsWithStats(m)
        k = 1 + int(np.argmax(st[1:, 4]))
        iris.append({"datei": f"iris{i}.png", "x": cx - R, "y": cy - R,
                     "pc": int(st[k, 0]) + int(st[k, 2]) / 2.0, "ws": int(st[k, 2]) / 2.0 + 3})

    # 3) Masken der Augenöffnungen (weich) und Lidschatten
    def ellipsen(grow, blur):
        m = np.zeros((h, w), np.uint8)
        for a in cfg["augen"]:
            ax = (a["achsen"][0] + grow, a["achsen"][1] + grow)
            cv2.ellipse(m, a["socket"], ax, a["winkel"], 0, 360, 255, -1)
        return cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), blur)

    socket = ellipsen(0, 3.5)
    alpha_png(ordner / "maske.png", socket)
    alpha_png(ordner / "lidmaske.png", ellipsen(4, 2.5))
    sch = np.zeros((h, w), np.float32)
    for a in cfg["augen"]:
        sx, sy = a["socket"]
        ax, ay = a["achsen"]
        cv2.ellipse(sch, (sx, sy - ay + 6), (ax, 14), a["winkel"], 0, 360, 1.0, -1)
    alpha_png(ordner / "schatten.png", cv2.GaussianBlur(sch, (0, 0), 7) * socket * 0.45)

    return {
        "id": cfg["id"], "name": cfg["name"], "ordner": f"assets/augen/{cfg['id']}/",
        "w": w, "h": h, "maxX": cfg["maxX"], "maxY": cfg["maxY"],
        "lidQuelle": cfg["lidQuelle"], "lidDunkel": cfg["lidDunkel"],
        "ex": sum(a["socket"][0] for a in cfg["augen"]) / 2,
        "ey": sum(a["socket"][1] for a in cfg["augen"]) / 2,
        "iris": iris,
        "augen": [{"cx": a["socket"][0], "cy": a["socket"][1], "a": a["achsen"][0], "b": a["achsen"][1],
                   "ang": a["winkel"]} for a in cfg["augen"]],
    }


def icons_bauen():
    ICONS.mkdir(parents=True, exist_ok=True)
    img = cv2.imread(str(QUELLEN / "schuppen.jpg"))
    # quadratischer Ausschnitt um die Augen
    cy, gross = 515, 300
    crop = img[cy - gross // 2:cy + gross // 2, 286 - gross // 2:286 + gross // 2]
    for s in (192, 512):
        cv2.imwrite(str(ICONS / f"icon-{s}.png"), cv2.resize(crop, (s, s), interpolation=cv2.INTER_AREA))
    # „maskable“: Motiv mit Sicherheitsrand auf Schwarz
    m = np.zeros((512, 512, 3), np.uint8)
    inner = cv2.resize(crop, (360, 360), interpolation=cv2.INTER_AREA)
    m[76:436, 76:436] = inner
    cv2.imwrite(str(ICONS / "icon-maskable-512.png"), m)
    cv2.imwrite(str(ICONS / "apple-touch-icon.png"), cv2.resize(crop, (180, 180), interpolation=cv2.INTER_AREA))
    cv2.imwrite(str(ICONS / "favicon-32.png"), cv2.resize(crop, (32, 32), interpolation=cv2.INTER_AREA))


if __name__ == "__main__":
    ZIEL.mkdir(parents=True, exist_ok=True)
    daten = [motiv_bauen(m) for m in MOTIVE]
    (ZIEL / "motive.json").write_text(json.dumps(daten, indent=1), encoding="utf-8")
    icons_bauen()
    print("Fertig:", ", ".join(m["id"] for m in daten))
