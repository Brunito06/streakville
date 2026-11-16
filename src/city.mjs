// Streakville: turns a GitHub contribution calendar into an animated isometric city (SVG).
// Usage:
//   node city.mjs --out city.svg                                  -> sample data
//   node city.mjs --out city.svg --data contrib.json --user octocat [--lang en|es] [--theme indigo|green|amber|purple|pink|red|teal|cyan|mono] [--color "#ff6600"]
// contrib.json = GitHub GraphQL response:
//   { data: { user: { contributionsCollection: { contributionCalendar: { weeks: [ { contributionDays: [ { date, contributionCount, weekday } ] } ] } } } } }
import { writeFileSync, readFileSync } from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); args[k] = v ?? process.argv[++i]; }
}
const OUT = args.out || 'city.svg';
const INPUT = args.data;
const USER = args.user || 'octocat';
const LANG = (args.lang || 'en').toLowerCase() === 'es' ? 'es' : 'en';

// ---------- text ----------
const T = {
  en: {
    months: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
    title: 'STREAKVILLE', contributions: 'contributions', sub: 'in the last year · every building is a day',
    best: 'BEST DAY', longest: 'LONGEST STREAK', current: 'CURRENT STREAK',
    daysRow: 'days in a row', daysGoing: 'days and counting', less: 'less', more: 'more',
    locale: 'en-GB', date: (d, m) => `${d} ${m}`,
    aria: (u, t, c) => `Streakville for ${u}: ${t} contributions in the last year, current streak of ${c} days.`,
  },
  es: {
    months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    title: 'STREAKVILLE', contributions: 'contribuciones', sub: 'en el último año · cada edificio es un día',
    best: 'MEJOR DÍA', longest: 'RACHA MÁS LARGA', current: 'RACHA ACTUAL',
    daysRow: 'días seguidos', daysGoing: 'días y contando', less: 'menos', more: 'más',
    locale: 'es-UY', date: (d, m) => `${d} ${m}`,
    aria: (u, t, c) => `Streakville de ${u}: ${t} contribuciones en el último año, racha actual de ${c} días.`,
  },
}[LANG];

// ---------- themes ----------
const THEMES = {
  indigo: {
    accent: '#4B5CF5', glow: '#1E2140', sky: '#2a3a80', water: '#0f1530',
    levels: [['#3a4699', '#2a3478', '#202862'], ['#5263e6', '#3b4bc4', '#2f3c9f'], ['#7483ff', '#4b5cf5', '#3a49c8'], ['#b4bdff', '#8a97ff', '#6a78e6']],
  },
  green: {
    accent: '#39D353', glow: '#13261a', sky: '#1f5a3a', water: '#0d1f17',
    levels: [['#0e6b30', '#0a5426', '#08401d'], ['#1f9a45', '#177a36', '#125f2a'], ['#33c15a', '#26a047', '#1d7f38'], ['#7ff09a', '#52d672', '#3bb558']],
  },
  amber: {
    accent: '#F5A524', glow: '#2a1f10', sky: '#6a4a1a', water: '#1f170b',
    levels: [['#8a5a14', '#6e470f', '#56370b'], ['#c47f1c', '#a26816', '#815212'], ['#f0a530', '#d08a1f', '#a86e18'], ['#ffd58a', '#f5b851', '#d9973a']],
  },
};
// builds a full theme from a single hex colour
const hex = h => { const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(h || '').trim()); if (!m) return null; let s = m[1]; if (s.length === 3) s = [...s].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
const toHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(a.map((v, i) => v + (b[i] - v) * t));
const BLACK = [0, 0, 0], WHITE = [255, 255, 255], BG = [20, 20, 22];
function themeFrom(base) {
  const c = hex(base);
  return {
    accent: toHex(c), glow: mix(c, BG, 0.85), sky: mix(c, BLACK, 0.45), water: mix(c, [10, 10, 12], 0.82),
    levels: [
      [mix(c, BLACK, 0.45), mix(c, BLACK, 0.58), mix(c, BLACK, 0.68)],
      [mix(c, BLACK, 0.15), mix(c, BLACK, 0.32), mix(c, BLACK, 0.45)],
      [mix(c, WHITE, 0.15), toHex(c), mix(c, BLACK, 0.2)],
      [mix(c, WHITE, 0.55), mix(c, WHITE, 0.35), mix(c, WHITE, 0.15)],
    ],
  };
}
Object.assign(THEMES, {
  purple: themeFrom('#A855F7'),
  pink: themeFrom('#EC4899'),
  red: themeFrom('#EF4444'),
  teal: themeFrom('#14B8A6'),
  cyan: themeFrom('#22D3EE'),
  mono: themeFrom('#A1A1AA'),
});
const TH = hex(args.color) ? themeFrom(args.color) : THEMES[(args.theme || 'indigo').toLowerCase()] || THEMES.indigo;

// deterministic random (windows, stars, cars): same data -> same image
let seed = 20061028;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const days = [];
if (INPUT) {
  const raw = JSON.parse(readFileSync(INPUT, 'utf8'));
  const weeks = raw.data.user.contributionsCollection.contributionCalendar.weeks;
  weeks.forEach((wk, w) => wk.contributionDays.forEach(d =>
    days.push({ date: new Date(d.date + 'T00:00:00Z'), count: d.contributionCount, w, dow: d.weekday })));
} else {
const now = new Date();
const TODAY = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const start = new Date(TODAY); start.setUTCDate(start.getUTCDate() - 52 * 7 - TODAY.getUTCDay());
for (let d = new Date(start); d <= TODAY; d.setUTCDate(d.getUTCDate() + 1)) {
  const idx = days.length, w = Math.floor(idx / 7), dow = d.getUTCDay();
  const phase = w / 52;
  let p = 0.32 + phase * phase * 0.6;
  if (dow === 0 || dow === 6) p *= 0.45;
  if (w >= 9 && w <= 12) p *= 0.25;
  let c = 0;
  if (rnd() < p) c = 1 + Math.floor(Math.pow(rnd(), 1.7) * (4 + phase * 22));
  if (w > 46 && rnd() < 0.25) c += 6 + Math.floor(rnd() * 10);
  days.push({ date: new Date(d), count: c, w, dow });
}
for (let k = 1; k <= 11; k++) if (days[days.length - k].count === 0) days[days.length - k].count = 1 + Math.floor(rnd() * 5);
}
const NW = Math.max(...days.map(d => d.w)) + 1; // number of weeks (52 or 53)

// ---------- stats ----------
const total = days.reduce((s, d) => s + d.count, 0);
const best = days.reduce((b, d) => (d.count > b.count ? d : b), days[0]);
let longest = 0, run = 0;
for (const d of days) { run = d.count ? run + 1 : 0; longest = Math.max(longest, run); }
let current = 0; { let k = days.length - 1; if (k >= 0 && !days[k].count) k--; for (; k >= 0 && days[k].count; k--) current++; } // if today is still 0, the streak is still alive
const max = Math.max(1, best.count);
const level = c => (c === 0 ? 0 : c <= max * 0.15 ? 1 : c <= max * 0.35 ? 2 : c <= max * 0.6 ? 3 : 4);

// ---------- geometry ----------
const W = 1200, H = 640;
const A = [17.9, 3.4], B = [-9, 6.9];   // weeks axis (u), weekdays axis (v)
const O = [172, 272];
const AV = 1.1;                          // width of the avenue between Wednesday and Thursday
const vRow = j => j + (j >= 4 ? AV : 0);
const FRONT = 7 + AV;                    // front edge of the blocks
const P = (u, v, h = 0) => [O[0] + u * A[0] + v * B[0], O[1] + u * A[1] + v * B[1] - h];
const f = n => Math.round(n * 10) / 10;
const pts = a => a.map(p => `${f(p[0])},${f(p[1])}`).join(' ');
const quad = (u0, v0, u1, v1, h = 0) => pts([P(u0, v0, h), P(u1, v0, h), P(u1, v1, h), P(u0, v1, h)]);
const COL = [
  { top: '#232329', right: '#1c1c21', front: '#18181c' },
  ...TH.levels.map(([top, right, front]) => ({ top, right, front })),
];
const g = 0.13;
const MONTHS = T.months;
const CYCLE = 28; // seconds for a full day/night cycle

// one building per day
function building(d) {
  const v = vRow(d.dow);
  const u0 = d.w + g, u1 = d.w + 1 - g, v0 = v + g, v1 = v + 1 - g;
  const c = COL[level(d.count)];
  const h = d.count ? 7 + Math.sqrt(d.count / max) * 128 : 1.6;
  let s = `<g class="b" style="animation-delay:${f(0.15 + d.w * 0.022)}s">`;
  s += `<polygon points="${pts([P(u0, v1), P(u1, v1), P(u1, v1, h), P(u0, v1, h)])}" fill="${c.front}"/>`;
  s += `<polygon points="${pts([P(u1, v0), P(u1, v1), P(u1, v1, h), P(u1, v0, h)])}" fill="${c.right}"/>`;
  s += `<polygon points="${quad(u0, v0, u1, v1, h)}" fill="${c.top}"/>`;
  if (h > 34) {
    let win = '';
    for (let y = 10; y < h - 8; y += 8.5) for (const t of [0.28, 0.62]) {
      if (rnd() > 0.42) continue;
      const a = P(u0 + (u1 - u0) * t, v1, h - y), b = P(u0 + (u1 - u0) * (t + 0.16), v1, h - y);
      const tw = rnd() < 0.3 ? ` class="tw" style="animation-duration:${f(5 + rnd() * 9)}s;animation-delay:-${f(rnd() * 14)}s"` : '';
      win += `<polygon points="${pts([a, b, [b[0], b[1] + 3.2], [a[0], a[1] + 3.2]])}"${tw}/>`;
    }
    if (win) s += `<g class="win" fill="#ffd58a">${win}</g>`;
  }
  if (d === days[days.length - 1]) {
    const top = P(d.w + 0.5, v + 0.5, h);
    s += `<circle cx="${f(top[0])}" cy="${f(top[1] - 10)}" r="3.5" fill="#EDEDED" class="pulse"/>`;
  }
  return s + '</g>';
}

// vehicle: isometric box driving along its lane
function vehicle(v, len, color, dir, dur, delay) {
  const u0 = dir > 0 ? -0.9 - len : 53.9, u1 = u0 + len, w = 0.32, h = len > 1 ? 7 : 4.5;
  const v0 = v - w / 2, v1 = v + w / 2;
  let s = `<g class="${dir > 0 ? 'go' : 'back'}" style="animation-duration:${dur}s;animation-delay:-${f(delay)}s">`;
  s += `<polygon points="${pts([P(u0, v1), P(u1, v1), P(u1, v1, h), P(u0, v1, h)])}" fill="${color.front}"/>`;
  s += `<polygon points="${pts([P(u1, v0), P(u1, v1), P(u1, v1, h), P(u1, v0, h)])}" fill="${color.side}"/>`;
  s += `<polygon points="${quad(u0, v0, u1, v1, h)}" fill="${color.top}"/>`;
  if (len > 1) {
    for (let k = 0.15; k < len - 0.2; k += 0.28) {
      const a = P(u0 + k, v1, h - 1.6), b = P(u0 + k + 0.18, v1, h - 1.6);
      s += `<polygon points="${pts([a, b, [b[0], b[1] + 2], [a[0], a[1] + 2]])}" fill="#141416" opacity=".75"/>`;
    }
  }
  const head = P(dir > 0 ? u1 : u0, v, 1.5), tail = P(dir > 0 ? u0 : u1, v, 1.5);
  s += `<circle class="hl" cx="${f(head[0])}" cy="${f(head[1])}" r="2.2" fill="#fff6d8"/>`;
  s += `<circle class="hl" cx="${f(tail[0])}" cy="${f(tail[1])}" r="1.6" fill="#ff5a5f"/>`;
  return s + '</g>';
}
const BUS = { top: '#ffd25e', side: '#e0ad2c', front: '#c4931c' };
const CARS = [
  { top: '#e8e8ef', side: '#bdbdc8', front: '#9d9daa' },
  { top: '#ff7b7f', side: '#e0565b', front: '#bf4247' },
  { top: '#5fe0a8', side: '#3dbd86', front: '#2e9a6c' },
  { top: '#9aa6ff', side: '#7480e6', front: '#5a66c8' },
];
function lane(v, dir, dur, list) {
  return list.map((t, k) => vehicle(v, t === 'bus' ? 1.5 : 0.75, t === 'bus' ? BUS : CARS[(k + Math.round(v)) % CARS.length], dir, dur, (dur / list.length) * k + rnd() * 2)).join('');
}

// ---------- scene ----------
const ground =
  `<polygon points="${quad(-0.6, -0.6, 53.6, FRONT + 0.15)}" fill="#1a1a1f" stroke="#26262b"/>` +
  `<polygon points="${quad(-0.6, 4, 53.6, 4 + AV)}" fill="#111114"/>` +
  `<polyline points="${pts([P(-0.6, 4 + AV / 2), P(53.6, 4 + AV / 2)])}" stroke="#3a3a42" stroke-width="1.2" stroke-dasharray="7 9" fill="none"/>` +
  `<polygon points="${quad(-0.6, FRONT + 0.15, 53.6, FRONT + 1.25)}" fill="#111114"/>` +
  `<polyline points="${pts([P(-0.6, FRONT + 0.7), P(53.6, FRONT + 0.7)])}" stroke="#3a3a42" stroke-width="1.2" stroke-dasharray="7 9" fill="none"/>` +
  `<polygon points="${quad(-0.6, FRONT + 1.25, 53.6, FRONT + 1.45)}" fill="#2a2a30"/>` +
  `<polygon points="${quad(-0.6, FRONT + 1.45, 53.6, FRONT + 2.9)}" fill="${TH.water}"/>`;
let waves = '';
for (let k = 0; k < 26; k++) {
  const u = rnd() * 50 + 1, v = FRONT + 1.7 + rnd() * 1.0, a = P(u, v), b = P(u + 1.2 + rnd(), v);
  waves += `<polyline class="wave" style="animation-delay:-${f(rnd() * 4)}s" points="${pts([a, b])}"/>`;
}

const rows = j => days.filter(d => d.dow === j).sort((a, b) => a.w - b.w).map(building).join('');
let blocks = '';
for (let j = 0; j < 4; j++) blocks += rows(j);
blocks += lane(4 + AV * 0.3, 1, 24, ['car', 'bus', 'car', 'car']);
blocks += lane(4 + AV * 0.7, -1, 27, ['bus', 'car', 'car']);
for (let j = 4; j < 7; j++) blocks += rows(j);
blocks += lane(FRONT + 0.42, 1, 19, ['car', 'car', 'bus', 'car', 'car']);
blocks += lane(FRONT + 0.98, -1, 21, ['car', 'bus', 'car', 'car']);

let stars = '';
for (let k = 0; k < 46; k++) {
  const x = 40 + rnd() * 1120, y = 140 + rnd() * 120;
  stars += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.7 + rnd() * 1.1)}"/>`;
}
const sky = `
<rect class="day" x="1" y="1" width="${W - 2}" height="${H - 2}" fill="url(#daysky)"/>
<g class="stars" fill="#D9D9E3">${stars}</g>
<g class="sun"><circle r="26" fill="#ffd58a" opacity=".12"/><circle r="13" fill="#ffd58a"/></g>
<g class="moon"><circle r="11" fill="#e6e8f5"/><circle cx="5" cy="-3" r="10" fill="#141416"/></g>
<g class="plane"><polygon points="0,0 16,3 0,6 4,3" fill="#D9D9E3"/><circle class="blink" cx="1" cy="3" r="1.6" fill="#ff5a5f"/></g>`;

let months = '', prevM = -1;
for (let w = 0; w < NW; w++) {
  const first = days.find(d => d.w === w); if (!first) continue; const m = first.date.getUTCMonth();
  if (m !== prevM && w > 0) { const p = P(w + 0.5, FRONT + 3.2); months += `<text x="${f(p[0])}" y="${f(p[1] + 16)}">${MONTHS[m]}</text>`; }
  prevM = m;
}

const fmt = n => n.toLocaleString(T.locale);
const fecha = d => T.date(d.date.getUTCDate(), MONTHS[d.date.getUTCMonth()]);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const stat = (x, label, value, sub) =>
  `<text x="${x}" y="58" font-family="${MONO}" font-size="14" letter-spacing="1.2" fill="#8A8A93">${label}</text>` +
  `<text x="${x}" y="94" font-family="${SANS}" font-size="32" font-weight="600" fill="#EDEDED">${value}</text>` +
  `<text x="${x}" y="118" font-family="${SANS}" font-size="16" fill="#8A8A93">${sub}</text>`;
const legend = COL.map((c, i) => `<rect x="${100 + i * 18}" y="${H - 41}" width="12" height="12" rx="3" fill="${i ? c.right : '#2A2A2E'}"/>`).join('');

const dx = f(A[0] * 55.5), dy = f(A[1] * 55.5);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.aria(USER, fmt(total), current))}">
<style>
@keyframes rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes tw{0%,55%{opacity:1}56%,100%{opacity:.1}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes go{0%{transform:translate(0,0);opacity:0}4%,96%{opacity:1}100%{transform:translate(${dx}px,${dy}px);opacity:0}}
@keyframes back{0%{transform:translate(0,0);opacity:0}4%,96%{opacity:1}100%{transform:translate(-${dx}px,-${dy}px);opacity:0}}
@keyframes day{0%,38%{opacity:1}50%,88%{opacity:0}100%{opacity:1}}
@keyframes night{0%,38%{opacity:0}50%,88%{opacity:1}100%{opacity:0}}
@keyframes winnight{0%,38%{opacity:.12}50%,88%{opacity:.95}100%{opacity:.12}}
@keyframes sun{0%{transform:translate(640px,250px);opacity:0}6%{opacity:1}22%{transform:translate(860px,165px)}40%{transform:translate(1100px,250px);opacity:1}46%,100%{transform:translate(1100px,250px);opacity:0}}
@keyframes moon{0%,46%{transform:translate(640px,240px);opacity:0}54%{opacity:1}70%{transform:translate(870px,170px)}88%{transform:translate(1100px,240px);opacity:1}94%,100%{transform:translate(1100px,240px);opacity:0}}
@keyframes plane{0%{transform:translate(-40px,215px);opacity:1}45%{transform:translate(1240px,150px);opacity:1}45.1%,100%{transform:translate(1240px,150px);opacity:0}}
@keyframes wave{0%,100%{opacity:.15}50%{opacity:.7}}
.b{animation:rise .7s cubic-bezier(.2,.8,.2,1) both}
.win{animation:winnight ${CYCLE}s ease-in-out infinite}
.tw{animation:tw 9s steps(1) infinite}
.pulse,.blink{animation:pulse 1.6s ease-in-out infinite}
.go{animation:go 20s linear infinite}
.back{animation:back 20s linear infinite}
.hl{animation:night ${CYCLE}s ease-in-out infinite}
.day{animation:day ${CYCLE}s ease-in-out infinite}
.stars{animation:night ${CYCLE}s ease-in-out infinite}
.sun{animation:sun ${CYCLE}s linear infinite}
.moon{animation:moon ${CYCLE}s linear infinite}
.plane{animation:plane 22s linear 3s infinite both}
.wave{stroke:${TH.accent};stroke-width:1.2;stroke-linecap:round;animation:wave 4s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs>
<radialGradient id="glow" cx="760" cy="340" r="480" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${TH.glow}"/><stop offset="1" stop-color="#141416" stop-opacity="0"/></radialGradient>
<linearGradient id="daysky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TH.sky}" stop-opacity=".55"/><stop offset=".55" stop-color="${TH.sky}" stop-opacity="0"/></linearGradient>
<clipPath id="card"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="24"/></clipPath>
</defs>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="24" fill="#141416" stroke="#2A2A2E"/>
<g clip-path="url(#card)">
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="url(#glow)"/>
${sky}
${ground}
<g>${waves}</g>
${blocks}
</g>
<text x="48" y="58" font-family="${MONO}" font-size="15" letter-spacing="1.2" fill="${TH.accent}">${T.title} · @${esc(USER.toUpperCase())}</text>
<text x="48" y="102" font-family="${SANS}" font-size="40" font-weight="600" fill="#EDEDED">${fmt(total)} ${T.contributions}</text>
<text x="48" y="130" font-family="${SANS}" font-size="17" fill="#8A8A93">${T.sub}</text>
${stat(660, T.best, best.count, fecha(best))}${stat(820, T.longest, longest, T.daysRow)}${stat(1010, T.current, current, T.daysGoing)}
<g font-family="${MONO}" font-size="14" fill="#6B6B75">${months}</g>
<text x="48" y="${H - 30}" font-family="${MONO}" font-size="14" fill="#6B6B75">${T.less}</text>${legend}<text x="194" y="${H - 30}" font-family="${MONO}" font-size="14" fill="#6B6B75">${T.more}</text>
</svg>`;
writeFileSync(OUT, svg);
console.log({ total, best: best.count, longest, current, bytes: svg.length });
