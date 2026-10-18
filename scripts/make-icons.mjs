// Builds the emblem SVGs and the PWA PNG icons from one drawing.
// Run with `npm run icons`; the outputs are committed so CI never needs a browser.
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const FROST = '#84C6E8';
const FROST_DEEP = '#4F8FB3';
const EMBER = '#E35A35';
const EMBER_DEEP = '#A63A1E';
const STONE = '#161A1F';
const STONE_DARK = '#0D1013';
const LINE = '#2F353C';

// Drawing on a 64 x 64 grid. Axe upright in front, two curved blades crossed behind it,
// their grips joined by a short chain.
const blade = (flip) => {
  const t = flip ? ' transform="matrix(-1 0 0 1 64 0)"' : '';
  return `<g${t}>
    <path d="M19.5 49 C22 35 35 24 58 16 C42 27 31 37 26 50.5 Z" fill="${EMBER}"/>
    <path d="M19.5 49 C22 35 35 24 58 16 C38 26 26 37 22.5 50 Z" fill="${EMBER_DEEP}" opacity=".6"/>
    <rect x="16" y="48.2" width="13.5" height="3.4" rx="1.4" transform="rotate(14 22.7 49.9)" fill="${EMBER}"/>
    <rect x="19.6" y="51" width="3.8" height="7.2" rx="1.6" transform="rotate(14 21.5 54.6)" fill="${EMBER_DEEP}"/>
  </g>`;
};

const chain = `<g fill="none" stroke="${EMBER}" stroke-width="1.9" stroke-linecap="round">
  <ellipse cx="22.6" cy="59.4" rx="2.3" ry="1.5"/>
  <ellipse cx="27.4" cy="60.6" rx="2.3" ry="1.5"/>
  <ellipse cx="32" cy="61" rx="2.3" ry="1.5"/>
  <ellipse cx="36.6" cy="60.6" rx="2.3" ry="1.5"/>
  <ellipse cx="41.4" cy="59.4" rx="2.3" ry="1.5"/>
</g>`;

const axe = `<g>
  <rect x="30" y="7" width="4" height="47" rx="1.6" fill="${FROST_DEEP}"/>
  <rect x="30.6" y="7" width="1.4" height="47" rx=".7" fill="${FROST}" opacity=".7"/>
  <path d="M30.5 8.5 L18 6 C15 11.5 14.6 18.5 17.4 24.5 C20 27.6 23.6 29 27.4 29.4 C27 24.4 28.3 20.6 30.5 18.4 Z" fill="${FROST}"/>
  <path d="M18 6 C15 11.5 14.6 18.5 17.4 24.5 C20 27.6 23.6 29 27.4 29.4 C22.6 26.4 18.8 21 18 6 Z" fill="#ECF7FD" opacity=".35"/>
  <path d="M33.5 9 L37.8 10 L37.8 15.4 L33.5 16.4 Z" fill="${FROST}"/>
  <rect x="29.2" y="52.5" width="5.6" height="4" rx="1.4" fill="${FROST}"/>
</g>`;

const art = `${blade(false)}${blade(true)}${chain}${axe}`;

const roundedBg = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E242B"/><stop offset="1" stop-color="${STONE_DARK}"/></linearGradient></defs>
  <rect x="1" y="1" width="62" height="62" rx="13" fill="url(#g)" stroke="${LINE}" stroke-width="1.5"/>`;
const squareBg = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E242B"/><stop offset="1" stop-color="${STONE_DARK}"/></linearGradient></defs>
  <rect width="64" height="64" fill="url(#g)"/>`;

// The art is drawn edge to edge, so scale it into a safe zone for each use.
const wrap = (bg, scale) => {
  const off = (64 - 64 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${bg}<g transform="translate(${off} ${off}) scale(${scale})">${art}</g></svg>`;
};

const emblem = wrap(roundedBg, 0.8);
const full = wrap(squareBg, 0.74);
const bare = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${art}</svg>`;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/emblem.svg', emblem);
writeFileSync('public/icons/mark.svg', bare);
writeFileSync('public/favicon.svg', emblem);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
async function png(svg, size, out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await png(full, 512, 'public/icons/icon-512.png');
await png(full, 192, 'public/icons/icon-192.png');
await png(full, 180, 'public/icons/apple-touch-icon.png');
await png(emblem, 32, 'public/icons/favicon-32.png');
if (process.argv.includes('--preview')) {
  await png(emblem, 32, process.argv[process.argv.indexOf('--preview') + 1] + '/p32.png');
  await png(emblem, 64, process.argv[process.argv.indexOf('--preview') + 1] + '/p64.png');
  await png(full, 512, process.argv[process.argv.indexOf('--preview') + 1] + '/p512.png');
}
await browser.close();
console.log('icons written');
