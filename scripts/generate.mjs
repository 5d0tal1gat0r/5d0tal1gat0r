// Builds the SVG cards for the GitHub profile README from public GitHub data.
// Palette, fonts and voice follow jesusrgc.dev ("rack room": midnight blue,
// soft white, crimson for action, green for things that are up).
//
//   node scripts/generate.mjs            (uses GITHUB_TOKEN, GH_TOKEN or `gh auth token`)
//   node scripts/generate.mjs --offline  (reuses data/github.json)
//
// Writes assets/*.svg. A daily workflow runs this and commits the result.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const LOGIN = '5d0tal1gat0r';
const root = new URL('../', import.meta.url);
const path = (p) => new URL(p, root);

const C = {
  bg: '#0d1524', surface: '#142238', fg: '#efedea', dim: '#a6adba', rule: '#26354d',
  accent: '#ee5a5d', soft: '#f08a8d', branch: '#6fbf8f', hl1: '#5c1e22', hl2: '#1e4430',
};

// ---------- data ----------
function token() {
  const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (env) return env;
  return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
}

const query = `query($login: String!) {
  user(login: $login) {
    createdAt
    followers { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
    repositories(first: 100, privacy: PUBLIC, ownerAffiliations: OWNER, isFork: false,
                 orderBy: { field: PUSHED_AT, direction: DESC }) {
      totalCount
      nodes { name stargazerCount languages(first: 10) { edges { size node { name } } } }
    }
  }
}`;

async function load() {
  const cache = path('data/github.json');
  if (process.argv.includes('--offline') && existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token()}`, 'content-type': 'application/json', 'user-agent': 'profile-readme-generator' },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL: HTTP ${res.status}`);
  const { data, errors } = await res.json();
  if (errors?.length || !data?.user) throw new Error(`GitHub GraphQL: ${JSON.stringify(errors ?? 'no user')}`);
  mkdirSync(path('data/'), { recursive: true });
  writeFileSync(cache, JSON.stringify(data.user, null, 2) + '\n');
  return data.user;
}

const u = await load();
const cal = u.contributionsCollection.contributionCalendar;
const repos = u.repositories.nodes;
const stars = repos.reduce((s, r) => s + r.stargazerCount, 0);
const langBytes = {};
for (const r of repos) for (const e of r.languages.edges) langBytes[e.node.name] = (langBytes[e.node.name] ?? 0) + e.size;
const totalBytes = Object.values(langBytes).reduce((a, b) => a + b, 0) || 1;
const langs = Object.entries(langBytes).sort((a, b) => b[1] - a[1]).slice(0, 5)
  .map(([name, b]) => ({ name, pct: (100 * b) / totalBytes }));
const since = new Date(u.createdAt);
const years = Math.floor((Date.now() - since) / (365.25 * 864e5));
const monthName = since.toLocaleString('en', { month: 'short' });
const n = (x) => x.toLocaleString('en');

// ---------- svg helpers ----------
const font = (file) => readFileSync(path(`fonts/${file}`)).toString('base64');
const fontFaces = (serif = false) => `
  @font-face { font-family: Plex; font-weight: 400; src: url(data:font/woff2;base64,${font('ibm-plex-mono-latin-400-normal.woff2')}) format('woff2'); }
  @font-face { font-family: Plex; font-weight: 600; src: url(data:font/woff2;base64,${font('ibm-plex-mono-latin-600-normal.woff2')}) format('woff2'); }${serif ? `
  @font-face { font-family: SrcSerif; font-weight: 200 900; src: url(data:font/woff2;base64,${font('source-serif-4-latin-wght-normal.woff2')}) format('woff2'); }` : ''}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FS = 14, CW = FS * 0.6, LH = 21; // Plex Mono advance is 600/1000 em

function svg(w, h, title, css, body, serif = false) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>${fontFaces(serif)}
  text { font-family: Plex, ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: ${FS}px; fill: ${C.fg}; white-space: pre; }
  .dim { fill: ${C.dim}; } .acc { fill: ${C.accent}; } .soft { fill: ${C.soft}; } .ok { fill: ${C.branch}; } .b { font-weight: 600; }
${css}
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<rect width="${w}" height="${h}" rx="10" fill="${C.bg}"/>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="none" stroke="${C.rule}"/>
${body}
</svg>
`;
}

// A row of coloured runs: [[text, class], ...] at a cell position.
const runs = (x, y, parts, cls = '') =>
  `<text x="${x}" y="${y}"${cls ? ` class="${cls}"` : ''} xml:space="preserve">${parts.map(([t, c]) => (c ? `<tspan class="${c}">${esc(t)}</tspan>` : esc(t))).join('')}</text>`;

// Title bar with three window dots, like a terminal.
function chrome(w, label) {
  return `<circle cx="22" cy="20" r="5" fill="${C.accent}"/><circle cx="40" cy="20" r="5" fill="${C.rule}"/><circle cx="58" cy="20" r="5" fill="${C.branch}"/>
<text x="${w / 2}" y="25" text-anchor="middle" class="dim" style="font-size:12px">${esc(label)}</text>
<line x1="0" y1="38" x2="${w}" y2="38" stroke="${C.rule}"/>`;
}

// ---------- 1. neofetch card: a server rack beside the facts ----------
function neofetch() {
  const W = 900;
  // Eight web servers behind one load balancer, like the web farm on the site.
  const loads = [6, 3, 8, 2, 5, 7, 4, 6];
  // Each row: " | " + 24 cells + an LED cell + " |". Borders are the same 30 cells.
  const rack = [
    [[' .' + '-'.repeat(27) + '.', 'dim']],
    [[' | ', 'dim'], ['lb   ', 'soft'], ['haproxy ', ''], ['[', 'dim'], ['='.repeat(9), 'acc'], [']', 'dim'], ['  |', 'dim']],
    [[' |' + '-'.repeat(27) + '|', 'dim']],
    ...loads.map((l, i) => [[' | ', 'dim'], [`web${i + 1} `, 'dim'], ['apache  ', ''], ['[', 'dim'], ['|'.repeat(l), 'ok'], [' '.repeat(9 - l), ''], [']', 'dim'], ['  |', 'dim']]),
    [[" '" + '-'.repeat(27) + "'", 'dim']],
    [['    ||                 ||', 'dim']],
  ];
  const top = 76;
  let leds = '';
  // A blinking LED on each unit, out of step, so the rack looks alive.
  rack.forEach((_, i) => {
    if (i === 1 || (i >= 3 && i <= 10)) {
      const x = 24 + 27.5 * CW, y = top + i * LH - 5;
      leds += `<circle class="led" style="animation-delay:${((i * 0.37) % 1.6).toFixed(2)}s" cx="${x}" cy="${y}" r="3" fill="${i === 1 ? C.accent : C.branch}"/>`;
    }
  });
  const rackSvg = rack.map((r, i) => runs(24, top + i * LH, r)).join('\n') + leds;

  const rx = 24 + 34 * CW;
  const facts = [
    [['jesus', 'acc b'], ['@', 'dim'], ['5d0tal1gat0r', 'acc b']],
    [['-----------------------', 'dim']],
    [['OS      ', 'soft b'], ['Arch Linux, Omarchy (Hyprland)', '']],
    [['Host    ', 'soft b'], ['Universidad de Granada', '']],
    [['Degree  ', 'soft b'], ['B.Sc. Computer Engineering', '']],
    [['Role    ', 'soft b'], ['sysadmin / infra / networks / devops', '']],
    [['Work    ', 'soft b'], ['White Swan Data, London ', ''], ['(2024, 2025)', 'dim']],
    [['Langs   ', 'soft b'], [langs.slice(0, 4).map((l) => l.name).join(', '), '']],
    [['Repos   ', 'soft b'], [`${u.repositories.totalCount} public, ${stars} stars`, '']],
    [['Year    ', 'soft b'], [`${n(cal.totalContributions)} contributions, ${n(u.contributionsCollection.totalCommitContributions)} commits`, '']],
    [['Uptime  ', 'soft b'], [`${years} years `, ''], [`(since ${monthName} ${since.getFullYear()})`, 'dim']],
    [['Web     ', 'soft b'], ['jesusrgc.dev', 'ok']],
  ];
  const lines = facts.map((r, i) => `<g class="line" style="animation-delay:${(0.15 + i * 0.09).toFixed(2)}s">${runs(rx, top + i * LH, r)}</g>`).join('\n');
  const swatches = [C.bg, C.surface, C.rule, C.hl1, C.accent, C.soft, C.hl2, C.branch, C.dim, C.fg]
    .map((c, i) => `<rect x="${rx + i * 26}" y="${top + facts.length * LH}" width="24" height="14" fill="${c}" stroke="${C.rule}"/>`).join('');
  const prompt = runs(24, top + 14 * LH, [['al1gat0r', 'ok'], ['@', 'dim'], ['omarchy', 'ok'], [' ~ ', 'dim'], ['$ ', 'acc']]);
  const cursorX = 24 + 21 * CW;
  const H = top + 14 * LH + 24;
  return svg(W, H, 'neofetch: Jesús Rodríguez González-Cuadros, sysadmin and infrastructure, Computer Engineering at UGR',
    `  .line { opacity: 0; animation: in .35s ease-out forwards; }
  @keyframes in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
  .led { animation: blink 1.6s steps(1) infinite; }
  @keyframes blink { 50% { opacity: .25; } }
  .cur { animation: cur 1s steps(1) infinite; } @keyframes cur { 50% { opacity: 0; } }`,
    `${chrome(W, 'al1gat0r@omarchy: ~')}
${runs(24, top - LH + 2, [['$ ', 'acc'], ['neofetch', '']])}
${rackSvg}
${lines}
${swatches}
${prompt}<rect class="cur" x="${cursorX}" y="${top + 14 * LH - 13}" width="${CW}" height="16" fill="${C.fg}"/>`);
}

// ---------- 2. git log card: the CV as commits, as on the site ----------
function fnv(s) {
  let h = 0x811c9dc5;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 7);
}
function gitlog() {
  const W = 900;
  const commits = [
    { y: '2026', t: 'bocatto: 2nd place at Startup Weekend Granada', key: 'bocatto', head: true },
    { y: '2026', t: 'NetTune: handwritten security logs in, monthly report out', key: 'NetTune' },
    { y: '2025', t: 'DevOps Intern (AI Agents), White Swan Data, London', key: 'DevOps Intern (AI Agents), White Swan Data' },
    { y: '2024', t: 'DevOps Intern (Mobile App Development), White Swan Data, London', key: 'DevOps Intern (Mobile App Development), White Swan Data' },
    { y: '2022', t: 'init: B.Sc. Computer Engineering, Universidad de Granada', key: 'B.Sc. Computer Engineering (Grado en Ingeniería Informática), Universidad de Granada', root: true },
  ];
  const top = 70;
  const rows = [];
  rows.push(runs(24, top, [['$ ', 'acc'], ['git log --graph --oneline ', ''], ['cv', 'ok']]));
  commits.forEach((c, i) => {
    const y = top + (i * 2 + 1.5) * LH;
    const parts = [['* ', 'ok'], [fnv(c.key) + ' ', 'soft']];
    if (c.head) parts.push(['(', 'soft'], ['HEAD -> ', 'acc b'], ['main', 'ok b'], [') ', 'soft']);
    if (c.root) parts.push(['(', 'soft'], ['tag: ', 'soft'], ['v0.1', 'ok b'], [') ', 'soft']);
    parts.push([c.t, '']);
    rows.push(`<g class="line" style="animation-delay:${(0.2 + i * 0.14).toFixed(2)}s">${runs(24, y, parts)}<text x="${W - 24}" y="${y}" text-anchor="end" class="dim">${c.y}</text>${i < commits.length - 1 ? runs(24, y + LH, [['|', 'ok']]) : ''}</g>`);
  });
  const H = top + (commits.length * 2 + 0.5) * LH + 12;
  return svg(W, H, 'git log of my CV: White Swan Data internships 2024 and 2025, NetTune and bocatto in 2026, UGR since 2022',
    `  .line { opacity: 0; animation: in .4s ease-out forwards; }
  @keyframes in { from { opacity: 0; } to { opacity: 1; } }`,
    `${chrome(W, 'git log')}\n${rows.join('\n')}`);
}

// ---------- 3. contribution grid as a wall of rack LEDs ----------
function contrib() {
  const weeks = cal.weeks;
  const W = 900, ox = 48, oy = 74, gap = 3;
  const cell = (W - ox - 24) / weeks.length - gap; // fill the card width
  const max = Math.max(1, ...weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)));
  const levels = [C.surface, '#3d1a22', C.hl1, '#a63f43', C.accent];
  const lvl = (c) => (c === 0 ? 0 : Math.min(4, 1 + Math.floor((3.999 * c) / max)));
  let cells = '', months = '', lastMonth = -1;
  weeks.forEach((w, x) => {
    const m = new Date(w.contributionDays[0].date).getMonth();
    if (m !== lastMonth && x < weeks.length - 2) {
      months += `<text x="${ox + x * (cell + gap)}" y="${oy - 10}" class="dim" style="font-size:11px">${new Date(2000, m).toLocaleString('en', { month: 'short' })}</text>`;
      lastMonth = m;
    }
    w.contributionDays.forEach((d) => {
      const y = new Date(d.date).getDay();
      const l = lvl(d.contributionCount);
      cells += `<rect class="c" style="animation-delay:${(x * 0.018).toFixed(3)}s" x="${ox + x * (cell + gap)}" y="${oy + y * (cell + gap)}" width="${cell}" height="${cell}" rx="2" fill="${levels[l]}"><title>${d.date}: ${d.contributionCount}</title></rect>`;
    });
  });
  const days = ['Mon', 'Wed', 'Fri'].map((d, i) => `<text x="14" y="${oy + (1 + i * 2) * (cell + gap) + 10}" class="dim" style="font-size:11px">${d}</text>`).join('');
  const gridW = weeks.length * (cell + gap);
  const H = oy + 7 * (cell + gap) + 46;
  const legend = levels.map((c, i) => `<rect x="${W - 24 - 34 - (5 - i) * 17}" y="${H - 30}" width="${cell}" height="${cell}" rx="2" fill="${c}"/>`).join('');
  return svg(W, H, `${n(cal.totalContributions)} contributions in the last year`,
    `  .c { opacity: 0; animation: on .5s ease-out forwards; }
  @keyframes on { from { opacity: 0; } to { opacity: 1; } }
  .scan { animation: scan 6s linear 1.4s infinite; opacity: 0; }
  @keyframes scan { 0% { transform: translateX(0); opacity: 0; } 5% { opacity: .9; } 90% { opacity: .9; } 100% { transform: translateX(${gridW}px); opacity: 0; } }`,
    `${chrome(W, 'contributions --last-year')}
${months}${days}
${cells}
<rect class="scan" x="${ox - 4}" y="${oy - 4}" width="2" height="${7 * (cell + gap) + 4}" fill="${C.branch}"/>
${runs(ox, H - 19, [[n(cal.totalContributions), 'acc b'], [' contributions in the last year', 'dim']])}
<text x="${W - 24 - 5 * 17 - 34 - 6}" y="${H - 19}" class="dim" style="font-size:11px" text-anchor="end">less</text><text x="${W - 24 - 34 + 6}" y="${H - 19}" class="dim" style="font-size:11px">more</text>${legend}`);
}

// ---------- 4. editorial header: the site's hero, in a banner ----------
function header() {
  const W = 900, H = 200;
  const tags = ['Sysadmin', 'Infrastructure', 'Networks', 'DevOps', 'Linux'];
  let x = 40;
  const chips = tags.map((t, i) => {
    const w = t.length * 7.8 + 22;
    const out = `<g class="chip" style="animation-delay:${(0.5 + i * 0.1).toFixed(2)}s"><rect x="${x}" y="150" width="${w}" height="26" rx="13" fill="none" stroke="${C.rule}"/><text x="${x + w / 2}" y="167" text-anchor="middle" style="font-size:13px" class="dim">${t}</text></g>`;
    x += w + 10;
    return out;
  }).join('');
  return svg(W, H, 'Jesús Rodríguez González-Cuadros: Computer Engineering at the University of Granada',
    `  .serif { font-family: SrcSerif, Georgia, serif; white-space: normal; }
  .name { font-size: 46px; font-weight: 600; letter-spacing: -0.5px; opacity: 0; animation: rise .7s cubic-bezier(.23,1,.32,1) .05s forwards; }
  .sub { opacity: 0; animation: rise .7s cubic-bezier(.23,1,.32,1) .25s forwards; }
  .chip { opacity: 0; animation: rise .5s cubic-bezier(.23,1,.32,1) forwards; }
  .rule { transform-origin: 40px 0; transform: scaleX(0); animation: grow .9s cubic-bezier(.77,0,.175,1) .2s forwards; }
  .up { animation: pulse 2.4s ease-in-out infinite; }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes grow { to { transform: scaleX(1); } }
  @keyframes pulse { 50% { opacity: .35; } }`,
    `<text x="40" y="84" class="serif name">Jesús Rodríguez González-Cuadros</text>
<rect class="rule" x="40" y="104" width="120" height="3" fill="${C.accent}"/>
<text x="40" y="134" class="sub dim" style="font-size:15px">Computer Engineering at the University of Granada</text>
${chips}
<circle class="up" cx="${W - 150}" cy="40" r="4" fill="${C.branch}"/>
<text x="${W - 140}" y="45" class="ok" style="font-size:12px">jesusrgc.dev: up</text>`, true);
}

// ---------- 6. profile card: the name header and neofetch facts in one ----------
function profile() {
  const W = 900;
  const tags = ['Sysadmin', 'Infrastructure', 'Networks', 'DevOps', 'Linux'];
  let x = 40;
  const chips = tags.map((t, i) => {
    const w = t.length * 7.8 + 22;
    const out = `<g class="rise" style="animation-delay:${(0.45 + i * 0.08).toFixed(2)}s"><rect x="${x}" y="150" width="${w}" height="26" rx="13" fill="none" stroke="${C.rule}"/><text x="${x + w / 2}" y="167" text-anchor="middle" style="font-size:13px" class="dim">${t}</text></g>`;
    x += w + 10;
    return out;
  }).join('');

  // neofetch, without a logo: the facts in two columns.
  const top = 250, colB = 470;
  const left = [
    [['OS      ', 'soft b'], ['Arch Linux, Omarchy', '']],
    [['WM      ', 'soft b'], ['Hyprland', '']],
    [['Host    ', 'soft b'], ['Universidad de Granada', '']],
    [['Degree  ', 'soft b'], ['Computer Engineering', '']],
    [['Work    ', 'soft b'], ['White Swan Data, London', '']],
  ];
  const right = [
    [['Langs   ', 'soft b'], [langs.slice(0, 3).map((l) => l.name).join(', '), '']],
    [['Repos   ', 'soft b'], [`${u.repositories.totalCount} public, ${stars} stars`, '']],
    [['Year    ', 'soft b'], [`${n(cal.totalContributions)} contributions`, '']],
    [['Uptime  ', 'soft b'], [`${years} years `, ''], [`(since ${since.getFullYear()})`, 'dim']],
    [['Web     ', 'soft b'], ['jesusrgc.dev', 'ok']],
  ];
  const d = (i) => (0.9 + i * 0.07).toFixed(2);
  const facts = [
    `<g class="rise" style="animation-delay:.8s">${runs(40, top, [['$ ', 'acc'], ['neofetch', '']])}</g>`,
    `<g class="rise" style="animation-delay:.85s">${runs(40, top + 1.6 * LH, [['jesus', 'acc b'], ['@', 'dim'], ['5d0tal1gat0r', 'acc b'], ['  ' + '-'.repeat(20), 'dim']])}</g>`,
    ...left.map((r, i) => `<g class="rise" style="animation-delay:${d(i)}s">${runs(40, top + (2.9 + i) * LH, r)}</g>`),
    ...right.map((r, i) => `<g class="rise" style="animation-delay:${d(i + 0.5)}s">${runs(colB, top + (2.9 + i) * LH, r)}</g>`),
  ].join('\n');
  const swy = top + 8.3 * LH;
  const swatches = [C.bg, C.surface, C.rule, C.hl1, C.accent, C.soft, C.hl2, C.branch, C.dim, C.fg]
    .map((c, i) => `<rect class="rise" style="animation-delay:${(1.3 + i * 0.03).toFixed(2)}s" x="${40 + i * 26}" y="${swy}" width="24" height="14" fill="${c}" stroke="${C.rule}"/>`).join('');
  const py = swy + 2.3 * LH;
  const prompt = runs(40, py, [['al1gat0r', 'ok'], ['@', 'dim'], ['omarchy', 'ok'], [' ~ ', 'dim'], ['$ ', 'acc']]);
  const H = py + 26;

  return svg(W, H, 'Jesús Rodríguez González-Cuadros: Computer Engineering at the University of Granada. Sysadmin, infrastructure, networks, DevOps, Linux.',
    `  .serif { font-family: SrcSerif, Georgia, serif; white-space: normal; }
  .name { font-size: 46px; font-weight: 600; letter-spacing: -0.5px; }
  .rise { opacity: 0; animation: rise .6s cubic-bezier(.23,1,.32,1) forwards; }
  .rule { transform-origin: 40px 0; transform: scaleX(0); animation: grow .9s cubic-bezier(.77,0,.175,1) .2s forwards; }
  .up { animation: pulse 2.4s ease-in-out infinite; }
  .cur { animation: cur 1s steps(1) infinite; }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes grow { to { transform: scaleX(1); } }
  @keyframes pulse { 50% { opacity: .35; } }
  @keyframes cur { 50% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .rise { opacity: 1; } .rule { transform: none; } }`,
    `<g class="rise" style="animation-delay:.05s"><text x="40" y="84" class="serif name">Jesús Rodríguez González-Cuadros</text></g>
<rect class="rule" x="40" y="104" width="120" height="3" fill="${C.accent}"/>
<g class="rise" style="animation-delay:.25s"><text x="40" y="134" class="dim" style="font-size:15px">Computer Engineering at the University of Granada</text></g>
${chips}
<circle class="up" cx="${W - 150}" cy="40" r="4" fill="${C.branch}"/>
<text x="${W - 140}" y="45" class="ok" style="font-size:12px">jesusrgc.dev: up</text>
<line x1="40" y1="${top - 44}" x2="${W - 40}" y2="${top - 44}" stroke="${C.rule}" stroke-dasharray="4 4"/>
${facts}
${swatches}
${prompt}<rect class="cur" x="${40 + 21 * CW}" y="${py - 13}" width="${CW}" height="16" fill="${C.fg}"/>`, true);
}

// ---------- 5. language bar ----------
function languages() {
  const W = 900, H = 120, bx = 24, bw = W - 48;
  const cols = [C.accent, C.branch, C.soft, '#7d8db0', C.dim];
  let x = bx;
  const segs = langs.map((l, i) => {
    const w = (bw * l.pct) / langs.reduce((s, q) => s + q.pct, 0);
    const r = `<rect class="seg" style="animation-delay:${(0.1 + i * 0.12).toFixed(2)}s" x="${x}" y="58" width="${w}" height="10" fill="${cols[i]}"/>`;
    x += w;
    return r;
  }).join('');
  let lx = bx;
  const legend = langs.map((l, i) => {
    const s = `${l.name} ${l.pct.toFixed(1)}%`;
    const out = `<rect x="${lx}" y="86" width="10" height="10" rx="2" fill="${cols[i]}"/><text x="${lx + 16}" y="96" style="font-size:12px"><tspan>${esc(l.name)}</tspan><tspan class="dim"> ${l.pct.toFixed(1)}%</tspan></text>`;
    lx += 16 + s.length * 7.2 + 22;
    return out;
  }).join('');
  return svg(W, H, `Languages across public repos: ${langs.map((l) => `${l.name} ${l.pct.toFixed(0)}%`).join(', ')}`,
    `  .seg { transform-box: fill-box; transform-origin: left; transform: scaleX(0); animation: g .6s cubic-bezier(.23,1,.32,1) forwards; }
  @keyframes g { to { transform: scaleX(1); } }`,
    `${runs(24, 36, [['$ ', 'acc'], ['languages ', ''], ['--public', 'dim']])}
<clipPath id="bar"><rect x="${bx}" y="58" width="${bw}" height="10" rx="5"/></clipPath>
<rect x="${bx}" y="58" width="${bw}" height="10" rx="5" fill="${C.surface}"/>
<g clip-path="url(#bar)">${segs}</g>
${legend}`);
}

// The README uses profile, contrib and languages. The other cards belong to the
// earlier layouts in options/ and are only built locally with --all.
const out = { 'profile.svg': profile(), 'contrib.svg': contrib(), 'languages.svg': languages() };
if (process.argv.includes('--all')) Object.assign(out, { 'neofetch.svg': neofetch(), 'gitlog.svg': gitlog(), 'header.svg': header() });
mkdirSync(path('assets/'), { recursive: true });
for (const [f, s] of Object.entries(out)) {
  writeFileSync(path(`assets/${f}`), s);
  console.log(`assets/${f}  ${(s.length / 1024).toFixed(1)} KB`);
}
