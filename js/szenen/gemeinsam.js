// Effekte, die mehrere Szenen nutzen.

const funken = [];

/** Aufsteigende Glutfunken */
export function zeichneFunken(g, t, dt, W, H, anzahl = 36) {
  while (funken.length < anzahl) {
    funken.push({ x: Math.random() * W, y: H + Math.random() * H, v: 0.03 + Math.random() * 0.06,
                  r: 1 + Math.random() * 2.2, ph: Math.random() * 6.28 });
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const f of funken) {
    f.y -= f.v * H * dt;
    f.x += Math.sin(t * 0.001 + f.ph) * 0.3;
    if (f.y < -10 || f.x < -10 || f.x > W + 10) { f.y = H + 10; f.x = Math.random() * W; }
    const a = (0.25 + 0.35 * Math.sin(t * 0.003 + f.ph) ** 2) * Math.max(0, f.y / H);
    g.fillStyle = `rgba(255,140,40,${a})`;
    g.beginPath(); g.arc(f.x, f.y, f.r * W / 600, 0, 6.283); g.fill();
  }
  g.restore();
}
