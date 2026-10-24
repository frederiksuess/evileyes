// Szene „Augen“: ein Foto, dessen Iris frei in der Augenöffnung wandert.
// Ebenen (von unten): Hintergrund ohne Iris -> Iris (maskiert) -> Lidschatten -> Lider (beim Blinzeln).
import { S } from '../einstellungen.js';
import { klemm, glatt, pfad, bildLaden } from '../util.js';

export class AugenSzene {
  constructor(daten) {
    this.M = daten;
    this.id = daten.id;
    this.abdunkeln = 0.42;     // im Spiel
    this.ox = 0; this.oy = 0;  // Blickrichtung -1..1
    this.pupille = 1;
    this.idle = { x: 0, y: 0 }; this.naechsterIdle = 0;
    this.blinzel = null; this.naechstesBlinzeln = performance.now() + 2500;
    this.ebene = document.createElement('canvas');
    this.lidEbene = document.createElement('canvas');
    this.ebene.width = this.lidEbene.width = daten.w;
    this.ebene.height = this.lidEbene.height = daten.h;
    this.ectx = this.ebene.getContext('2d');
    this.lctx = this.lidEbene.getContext('2d');
    this.IMG = null;
  }

  async laden() {
    if (this.IMG) return;
    const o = this.M.ordner;
    const [bg, maske, lidmaske, schatten, ...iris] = await Promise.all([
      bildLaden(o + 'bg.jpg'), bildLaden(o + 'maske.png'), bildLaden(o + 'lidmaske.png'),
      bildLaden(o + 'schatten.png'), ...this.M.iris.map(i => bildLaden(o + i.datei))
    ]);
    this.IMG = { bg, maske, lidmaske, schatten, iris };
  }

  // ---------------- Blinzeln ----------------
  blinzeln(doppelt = false, verzoegerung = 0) {
    if (this.blinzel) return;
    this.blinzel = { t0: performance.now() + verzoegerung, doppelt };
  }

  lidStand(t) {
    if (!this.blinzel) {
      if (t > this.naechstesBlinzeln) this.blinzeln(Math.random() < 0.18);
      else return 0;
    }
    const ZU = 85, HALT = 45, AUF = 160;
    const d = t - this.blinzel.t0;
    if (d < 0) return 0;
    if (d < ZU) { const x = d / ZU; return x * x * (3 - 2 * x); }
    if (d < ZU + HALT) return 1;
    if (d < ZU + HALT + AUF) { const x = (d - ZU - HALT) / AUF; return (1 - x) * (1 - x); }
    if (this.blinzel.doppelt) this.blinzel = { t0: t + 70, doppelt: false };
    else { this.blinzel = null; this.naechstesBlinzeln = t + 2500 + Math.random() * 4500; }
    return 0;
  }

  /** Lidkanten eines Auges für den Schließgrad c (0 offen … 1 zu) */
  static lidKurven(e, c) {
    const N = 48, th = e.ang * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
    const P = (u, v) => [e.cx + u * cs - v * sn, e.cy + u * sn + v * cs];
    const treffen = 0.62;                    // wo sich die Lider treffen (Anteil von oben)
    const top = [], oben = [], unten = [], bot = [];
    for (let i = 0; i <= N; i++) {
      const u = -e.a - 3 + (2 * e.a + 6) * i / N;
      const k = Math.sqrt(Math.max(0, 1 - (u / e.a) ** 2));
      const vt = -e.b * k, vb = e.b * k;
      const vm = vt + (vb - vt) * treffen;
      top.push(P(u, vt));
      bot.push(P(u, vb));
      oben.push(P(u, vt + (vm + 1.5 - vt) * c));
      unten.push(P(u, vb + (vm - 1.5 - vb) * c));
    }
    return { top, oben, unten, bot, P };
  }

  /** Lider zeichnen: Haut über/unter dem Auge rutscht in Streifen über die Öffnung. */
  zeichneLider(c) {
    const { M, IMG, lctx: g } = this;
    g.clearRect(0, 0, M.w, M.h);
    if (c < 0.01) return false;
    for (const e of M.augen) {
      const K = AugenSzene.lidKurven(e, c);
      const H = 2 * e.b + 14;

      g.save();
      g.beginPath();
      pfad(g, K.oben);
      g.lineTo(...K.P(e.a + 3, -e.b - H));
      g.lineTo(...K.P(-e.a - 3, -e.b - H));
      g.closePath();
      g.clip();
      for (let i = 0; i < K.oben.length - 1; i++) {
        const [sx, sy] = K.top[i], [dx, dy] = K.oben[i];
        const w = Math.abs(K.oben[i + 1][0] - dx) + 1.5;
        if (M.lidQuelle === 'unten') {
          // Haut unter dem Auge gespiegelt als Oberlid (wenn darüber z. B. ein heller Brauenwulst liegt)
          const [bx, by] = K.bot[i];
          g.save();
          g.translate(0, dy);
          g.scale(1, -1);
          g.drawImage(IMG.bg, bx, Math.min(by, M.h - H), w, H, dx, 0, w, H);
          g.restore();
        } else {
          g.drawImage(IMG.bg, sx, Math.max(0, sy - H), w, H, dx, dy - H, w, H);
        }
      }
      g.fillStyle = `rgba(0,0,0,${M.lidDunkel})`;
      g.fillRect(0, 0, M.w, M.h);
      g.restore();

      g.save();
      g.beginPath();
      pfad(g, K.unten);
      g.lineTo(...K.P(e.a + 3, e.b + H));
      g.lineTo(...K.P(-e.a - 3, e.b + H));
      g.closePath();
      g.clip();
      for (let i = 0; i < K.unten.length - 1; i++) {
        const [sx, sy] = K.bot[i], [dx, dy] = K.unten[i];
        const w = Math.abs(K.unten[i + 1][0] - dx) + 1.5;
        g.drawImage(IMG.bg, sx, Math.min(sy, M.h - H), w, H, dx, dy, w, H);
      }
      g.fillStyle = 'rgba(0,0,0,0.1)';
      g.fillRect(0, 0, M.w, M.h);
      g.restore();

      const st = Math.min(1, c * 4);
      g.save();
      g.lineCap = 'round';
      g.shadowColor = `rgba(0,0,0,${0.75 * st})`;
      g.shadowBlur = 7;
      g.shadowOffsetY = 3;
      g.strokeStyle = `rgba(12,6,3,${0.85 * st})`;
      g.lineWidth = 2.5;
      g.beginPath(); pfad(g, K.oben); g.stroke();
      g.shadowOffsetY = -1;
      g.shadowBlur = 4;
      g.strokeStyle = `rgba(12,6,3,${0.55 * st})`;
      g.lineWidth = 1.5;
      g.beginPath(); pfad(g, K.unten); g.stroke();
      g.restore();
    }
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(IMG.lidmaske, 0, 0);
    g.globalCompositeOperation = 'source-over';
    return true;
  }

  /**
   * Iris mit verstellbarem Pupillenschlitz: links/rechts vom Schlitz wird das Bild
   * horizontal gestaucht bzw. gedehnt – wie bei einer echten Schlitzpupille.
   */
  static zeichneIris(g, img, ir, x, y, p) {
    const d = img.width, h = img.height;
    const L = ir.pc - ir.ws, R = ir.pc + ir.ws;
    const L2 = ir.pc - ir.ws * p, R2 = ir.pc + ir.ws * p;
    g.drawImage(img, 0, 0, L, h, x, y, L2 + 0.5, h);
    g.drawImage(img, L, 0, R - L, h, x + L2, y, R2 - L2, h);
    g.drawImage(img, R, 0, d - R, h, x + R2 - 0.5, y, d - R2 + 0.5, h);
  }

  layout(W, H) {
    const a = S.ansicht[this.id];
    const s = Math.min(W / 600, H / 330) * a.zoom;
    const cx = W / 2, cy = H / 2 + a.hoehe * H * 0.35;
    return { s, dw: this.M.w * s, dh: this.M.h * s, dx: cx - this.M.ex * s, dy: cy - this.M.ey * s, cx, cy };
  }

  /** Blickrichtung, Pupille und Lidstellung nachführen */
  bewegen(t, dt, e, L) {
    let zx, zy, tempo;
    if (e.ziel) {
      zx = klemm((e.ziel[0] - L.cx) / (e.W * 0.385), -1, 1);
      zy = klemm((e.ziel[1] - L.cy) / (e.H * 0.385), -1, 1);
      tempo = e.zielQuelle === 'finger' ? 14 : e.zielQuelle === 'spiel' ? 7 : (e.viele ? 6 : 10);
    } else {
      if (t > this.naechsterIdle) {
        this.idle = Math.random() < 0.5 ? { x: 0, y: 0 } : { x: Math.random() * 1.6 - 0.8, y: Math.random() * 0.8 - 0.4 };
        this.naechsterIdle = t + 1500 + Math.random() * 3000;
      }
      zx = this.idle.x; zy = this.idle.y; tempo = 6;
    }
    const k = 1 - Math.exp(-tempo * dt);
    this.ox += (zx - this.ox) * k;
    this.oy += (zy - this.oy) * k;
    // nah: schmaler Schlitz, fern: weiter
    this.pupille = glatt(this.pupille, 1.18 - e.naehe * 0.6, dt, 0.5);
  }

  zeichne(ctx, t, dt, e) {
    if (!this.IMG) return;
    const { M, IMG, ectx } = this;
    const W = e.W, H = e.H;
    const L = this.layout(W, H);
    this.bewegen(t, dt, e, L);

    // Iris-Ebene
    ectx.globalCompositeOperation = 'source-over';
    ectx.globalAlpha = 1;
    ectx.clearRect(0, 0, M.w, M.h);
    let fx = this.ox, fy = this.oy;
    const n = Math.hypot(fx, fy);
    if (n > 1) { fx /= n; fy /= n; }
    const px = fx * M.maxX, py = fy * M.maxY;
    const flacker = 0.05 * (Math.sin(t * 0.0073) * 0.5 + Math.sin(t * 0.0131) * 0.5);
    const gl = klemm(e.aktivitaet * 0.7 + flacker, 0, 1);
    M.iris.forEach((ir, i) => {
      const x = ir.x + px, y = ir.y + py;
      ectx.globalCompositeOperation = 'source-over';
      ectx.globalAlpha = 1;
      AugenSzene.zeichneIris(ectx, IMG.iris[i], ir, x, y, this.pupille);
      if (gl > 0.01) {
        ectx.globalCompositeOperation = 'lighter';
        ectx.globalAlpha = gl * 0.4;
        AugenSzene.zeichneIris(ectx, IMG.iris[i], ir, x, y, this.pupille);
      }
    });
    ectx.globalAlpha = 1;
    ectx.globalCompositeOperation = 'destination-in';
    ectx.drawImage(IMG.maske, 0, 0);
    ectx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(IMG.bg, L.dx, L.dy, L.dw, L.dh);
    ctx.drawImage(this.ebene, L.dx, L.dy, L.dw, L.dh);
    ctx.drawImage(IMG.schatten, L.dx, L.dy, L.dw, L.dh);

    // Blinzeln; kommt man näher oder ist viel los, verengen sich die Augen
    const basis = Math.min(0.45, Math.max(e.naehe * 0.42, e.aktivitaet * 0.18));
    if (this.zeichneLider(Math.max(this.lidStand(t), basis))) ctx.drawImage(this.lidEbene, L.dx, L.dy, L.dw, L.dh);

    // Bildränder sanft ins Schwarz auslaufen lassen
    const fw = L.dw * 0.07, fh = L.dh * 0.05;
    const verlauf = (x0, y0, x1, y1) => {
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      return gr;
    };
    ctx.fillStyle = verlauf(L.dx, 0, L.dx + fw, 0); ctx.fillRect(L.dx - 1, L.dy, fw + 1, L.dh);
    ctx.fillStyle = verlauf(L.dx + L.dw, 0, L.dx + L.dw - fw, 0); ctx.fillRect(L.dx + L.dw - fw, L.dy, fw + 1, L.dh);
    ctx.fillStyle = verlauf(0, L.dy, 0, L.dy + fh); ctx.fillRect(L.dx, L.dy - 1, L.dw, fh + 1);
    ctx.fillStyle = verlauf(0, L.dy + L.dh, 0, L.dy + L.dh - fh); ctx.fillRect(L.dx, L.dy + L.dh - fh, L.dw, fh + 1);
  }
}
