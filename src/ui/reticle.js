// The aiming reticle replaces the OS cursor during play, so it is drawn here
// once and used by both the HUD and the settings preview -- the preview has to
// be the real thing, not an approximation of it.

export const CURSOR_STYLES = [
  ['reticle', 'Reticle'],
  ['ring', 'Ring'],
  ['cross', 'Crosshair'],
  ['dot', 'Dot'],
  ['chevron', 'Brackets'],
  ['target', 'Target'],
];

export const CURSOR_COLORS = [
  ['white', 'White'],
  ['ball', 'Ball yellow'],
  ['teal', 'Kitchen teal'],
  ['orange', 'Orange'],
  ['magenta', 'Magenta'],
  ['ink', 'Navy'],
];

const HEX = {
  white: '#ffffff',
  ball: '#e4ef3f',
  teal: '#2ee0c8',
  orange: '#ff9330',
  magenta: '#ff5ec4',
  ink: '#10202c',
};

export function cursorColorHex(name) { return HEX[name] || HEX.white; }

// Every shape is stroked twice: a dark casing first, then the colour on top.
// Without it the reticle disappears against the light court or the pale sky.
function stroked(g, color, width, draw) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = color === HEX.ink ? 'rgba(255,255,255,0.85)' : 'rgba(10,22,32,0.7)';
  g.lineWidth = width + 2.6;
  draw();
  g.strokeStyle = color;
  g.lineWidth = width;
  draw();
}

function filled(g, color, draw) {
  g.strokeStyle = color === HEX.ink ? 'rgba(255,255,255,0.85)' : 'rgba(10,22,32,0.7)';
  g.lineWidth = 2.6;
  draw();
  g.stroke();
  g.fillStyle = color;
  draw();
  g.fill();
}

export function drawReticle(g, x, y, style, colorName, scale = 1) {
  const c = cursorColorHex(colorName);
  const s = scale;
  g.save();
  g.translate(x, y);

  switch (style) {
    case 'ring':
      stroked(g, c, 2 * s, () => {
        g.beginPath();
        g.arc(0, 0, 9 * s, 0, Math.PI * 2);
        g.stroke();
      });
      filled(g, c, () => { g.beginPath(); g.arc(0, 0, 1.8 * s, 0, Math.PI * 2); });
      break;

    case 'cross':
      stroked(g, c, 2 * s, () => {
        g.beginPath();
        g.moveTo(-13 * s, 0); g.lineTo(-3 * s, 0);
        g.moveTo(3 * s, 0); g.lineTo(13 * s, 0);
        g.moveTo(0, -13 * s); g.lineTo(0, -3 * s);
        g.moveTo(0, 3 * s); g.lineTo(0, 13 * s);
        g.stroke();
      });
      break;

    case 'dot':
      filled(g, c, () => { g.beginPath(); g.arc(0, 0, 4.2 * s, 0, Math.PI * 2); });
      break;

    case 'chevron': {
      const a = 11 * s, b = 5 * s;
      stroked(g, c, 2.4 * s, () => {
        g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          g.moveTo(sx * a, sy * (a - b));
          g.lineTo(sx * a, sy * a);
          g.lineTo(sx * (a - b), sy * a);
        }
        g.stroke();
      });
      break;
    }

    case 'target':
      stroked(g, c, 1.8 * s, () => {
        g.beginPath();
        g.arc(0, 0, 11 * s, 0, Math.PI * 2);
        g.moveTo(-15 * s, 0); g.lineTo(-11 * s, 0);
        g.moveTo(11 * s, 0); g.lineTo(15 * s, 0);
        g.moveTo(0, -15 * s); g.lineTo(0, -11 * s);
        g.moveTo(0, 11 * s); g.lineTo(0, 15 * s);
        g.stroke();
      });
      stroked(g, c, 1.6 * s, () => {
        g.beginPath();
        g.arc(0, 0, 4.6 * s, 0, Math.PI * 2);
        g.stroke();
      });
      break;

    default: // reticle
      stroked(g, c, 1.9 * s, () => {
        g.beginPath();
        g.arc(0, 0, 7.5 * s, 0, Math.PI * 2);
        g.moveTo(-14 * s, 0); g.lineTo(-4.5 * s, 0);
        g.moveTo(4.5 * s, 0); g.lineTo(14 * s, 0);
        g.moveTo(0, -14 * s); g.lineTo(0, -4.5 * s);
        g.moveTo(0, 4.5 * s); g.lineTo(0, 14 * s);
        g.stroke();
      });
      filled(g, c, () => { g.beginPath(); g.arc(0, 0, 1.5 * s, 0, Math.PI * 2); });
  }

  g.restore();
}
