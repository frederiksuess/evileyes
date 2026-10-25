// Szene „Röntgenspiegel“: Das Portal zeigt die Gäste selbst – als geisterhaftes Röntgenbild –
// und darüber leuchtet ihr Skelett, das jede Bewegung mitmacht.
// Nutzt dieselbe Körpererkennung wie die Skelett-Szene. Braucht etwas Licht auf den Personen.
import { S } from '../einstellungen.js';
import { video, kamera, videoGroesse } from '../kamera.js';
import { bewegung } from '../bewegung.js';
import { SkelettSzene } from './skelett.js';

const STIL_ROENTGEN = { knochen: '#eefcff', kontur: '#0c2a36', glut: 'rgba(120,220,255,0.22)', glutBreite: 0.2 };

// Rasterlinien wie auf einem alten Leuchtschirm, einmal vorgerendert
const RASTER = (() => {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(0, 0, 4, 2);
  return c;
})();

export class RoentgenSzene extends SkelettSzene {
  constructor() {
    super();
    this.id = 'roentgen';
    this.abdunkeln = 0.2;
    this.stil = STIL_ROENTGEN;
    this.ruhepose = false;
    this.filterGeht = 'filter' in document.createElement('canvas').getContext('2d');
  }

  zeichneHintergrund(ctx, t, dt, W, H) {
    ctx.fillStyle = '#01070a';
    ctx.fillRect(0, 0, W, H);

    if (kamera.laeuft && video.readyState >= 2) {
      // Kamerabild genau dort, wo auch das Skelett liegt
      const [vw, vh] = videoGroesse();
      const m = this.abbildung(W, H, vw, vh);
      const bw = vw * m.sc, bh = vh * m.sc;
      const x = W / 2 - bw / 2, y = H / 2 - bh / 2 + m.hoehe * H * 0.35;
      const hell = Math.min(3, bewegung.verstaerkung || 1);
      ctx.save();
      if (S.spiegeln) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      const xx = S.spiegeln ? W - x - bw : x;
      ctx.globalAlpha = 0.55 + 0.05 * Math.sin(t * 0.013);
      if (this.filterGeht) ctx.filter = `grayscale(1) invert(1) brightness(${(0.55 * hell).toFixed(2)}) contrast(1.7)`;
      ctx.drawImage(video, xx, y, bw, bh);
      ctx.filter = 'none';
      ctx.restore();
      // bläuliche Tönung
      ctx.save();
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = 'rgb(40,150,190)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(160,230,255,0.5)';
      ctx.font = `500 ${Math.round(Math.min(W, H) * 0.045)}px "Alegreya Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Der Röntgenspiegel braucht die Kamera', W / 2, H / 2);
    }

    // Leuchtschirm: Raster, wandernder Scan-Balken, dunkle Ränder
    ctx.save();
    ctx.fillStyle = ctx.createPattern(RASTER, 'repeat');
    ctx.fillRect(0, 0, W, H);
    const sy = ((t * 0.00018) % 1.3 - 0.15) * H;
    const scan = ctx.createLinearGradient(0, sy - H * 0.08, 0, sy + H * 0.08);
    scan.addColorStop(0, 'rgba(140,230,255,0)');
    scan.addColorStop(0.5, 'rgba(140,230,255,0.13)');
    scan.addColorStop(1, 'rgba(140,230,255,0)');
    ctx.fillStyle = scan;
    ctx.fillRect(0, sy - H * 0.08, W, H * 0.16);
    const rand = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    rand.addColorStop(0, 'rgba(0,0,0,0)'); rand.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = rand;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}
