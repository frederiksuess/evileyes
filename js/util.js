// Kleine, zustandslose Helfer, die überall gebraucht werden.

export const klemm = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const zufall = (a, b) => a + Math.random() * (b - a);

/** Exponentielle Glättung, unabhängig von der Bildrate. tau in Sekunden. */
export const glatt = (wert, ziel, dt, tau) => wert + (ziel - wert) * (1 - Math.exp(-dt / tau));

// 2D-Vektoren als [x, y]
export const plus = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const minus = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mal = (a, s) => [a[0] * s, a[1] * s];
export const mitte = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const abst = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const laenge = a => Math.hypot(a[0], a[1]);
export const einheit = a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
export const senk = a => [-a[1], a[0]];
export const drehe = (a, w) => [a[0] * Math.cos(w) - a[1] * Math.sin(w), a[0] * Math.sin(w) + a[1] * Math.cos(w)];

/** Kürzeste Winkeldifferenz in (-π, π] */
export const winkelDiff = (a, b) => {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/** Polylinie in einen Pfad legen */
export function pfad(g, pts) {
  for (let i = 0; i < pts.length; i++) i ? g.lineTo(pts[i][0], pts[i][1]) : g.moveTo(pts[i][0], pts[i][1]);
}

export function bildLaden(src) {
  return new Promise((ok, fehler) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => fehler(new Error('Bild konnte nicht geladen werden: ' + src));
    i.src = src;
  });
}
