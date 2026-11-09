// Puts the snk snake in a card and keeps it inside the contribution grid.
// snk parks the snake in the row above the grid at the start and end of each
// loop; clipping the snake to the grid hides it there, so it only ever moves
// over the squares. The card's colours follow the light or dark variant.
//
//   node scripts/frame-snake.mjs dist/snake-dark.svg dist/snake-light.svg
import { readFileSync, writeFileSync } from 'node:fs';

const themes = {
  dark: { bg: '#0d1524', rule: '#26354d' },
  light: { bg: '#ffffff', rule: '#d0d7de' },
};

for (const file of process.argv.slice(2)) {
  let s = readFileSync(file, 'utf8');
  if (s.includes('id="grid-clip"')) continue; // already framed
  const t = themes[file.includes('light') ? 'light' : 'dark'];

  // Grid bounds from the contribution cells (12px squares on a 16px pitch).
  const cells = [...s.matchAll(/<rect class="c[^"]*" x="([\d.]+)" y="([\d.]+)"/g)].map((m) => [+m[1], +m[2]]);
  if (!cells.length) throw new Error(`${file}: no contribution cells found`);
  const x0 = Math.min(...cells.map((c) => c[0])) - 2, y0 = Math.min(...cells.map((c) => c[1])) - 2;
  const x1 = Math.max(...cells.map((c) => c[0])) + 14, y1 = Math.max(...cells.map((c) => c[1])) + 14;

  // Progress bar under the grid ("u" rects) sets the bottom of the card.
  const bars = [...s.matchAll(/<rect class="u[^"]*" height="([\d.]+)"[^>]* y="([\d.]+)"/g)].map((m) => +m[1] + +m[2]);
  const bottom = (bars.length ? Math.max(...bars) : y1) + 16;
  const pad = 16;
  const vx = x0 - pad, vy = y0 - pad, vw = x1 - x0 + 2 * pad, vh = bottom - vy;

  s = s.replace(/<svg viewBox="[^"]*" width="[^"]*" height="[^"]*"/, `<svg viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}"`);
  s = s.replace('</style>', `</style><defs><clipPath id="grid-clip"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/></clipPath></defs>` +
    `<rect x="${vx + 0.5}" y="${vy + 0.5}" width="${vw - 1}" height="${vh - 1}" rx="10" fill="${t.bg}" stroke="${t.rule}"/>`);
  // Wrap every snake segment in the clip.
  const first = s.indexOf('<rect class="s ');
  const last = s.lastIndexOf('</svg>');
  if (first < 0) throw new Error(`${file}: no snake found`);
  s = s.slice(0, first) + '<g clip-path="url(#grid-clip)">' + s.slice(first, last) + '</g>' + s.slice(last);
  writeFileSync(file, s);
  console.log(`${file}: card ${vw}x${vh}, snake clipped to ${x1 - x0}x${y1 - y0}`);
}
