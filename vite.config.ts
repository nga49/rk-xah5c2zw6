/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Files in public/ that the app needs offline. Everything Vite emits is added at build time.
const PUBLIC_SHELL = [
  'manifest.webmanifest',
  'favicon.svg',
  'icons/emblem.svg',
  'icons/mark.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://api.github.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

/** Writes sw.js with the exact list of built files, so the whole app is cached on first open. */
function serviceWorker(): Plugin {
  return {
    name: 'ragnarok-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256');
      const emitted: string[] = [];
      for (const [fileName, item] of Object.entries(bundle)) {
        if (fileName.endsWith('.map') || fileName.endsWith('.woff')) continue;
        emitted.push(fileName);
        hash.update(fileName);
        hash.update(item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : Buffer.from(item.source));
      }
      for (const f of PUBLIC_SHELL) hash.update(readFileSync(`public/${f}`));
      const precache = ['./', ...new Set([...emitted, ...PUBLIC_SHELL])].sort();
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync('src/sw/sw.js', 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/** Adds the Content-Security-Policy to the built page only (the dev server needs inline scripts). */
function securityPolicy(): Plugin {
  return {
    name: 'ragnarok-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), securityPolicy(), serviceWorker()],
  build: {
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
    // Terser, because it can be told never to generate a short name the privacy scan rejects (scripts/privacy-scan.mjs).
    minify: 'terser',
    terserOptions: { mangle: { reserved: ['L4'] } },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
