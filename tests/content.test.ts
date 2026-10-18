// Guards for the hard rules: copy style, privacy in the public code, no game IP, PWA icons.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const sources = [...walk(join(root, 'src')), join(root, 'index.html'), join(root, 'public/manifest.webmanifest'), join(root, 'README.md')].filter((f) => /\.(tsx?|json|css|html|webmanifest|md|js)$/.test(f));
const read = (f: string) => {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return '';
  }
};

describe('hard rules', () => {
  it('no long em dash anywhere in the app text', () => {
    const bad = sources.filter((f) => read(f).includes('—'));
    expect(bad).toEqual([]);
  });

  it('no personal data in the public code', () => {
    for (const f of sources) {
      const t = read(f);
      for (const needle of ['163.6', 'hernia', 'L4 ']) expect(t.includes(needle), `${f} contains ${needle}`).toBe(false);
    }
  });

  it('no game names or IP in the UI', () => {
    const ui = sources.filter((f) => /src\/(screens|ui|plan)\//.test(f) || f.endsWith('index.html') || f.endsWith('.webmanifest'));
    for (const f of ui) expect(read(f), f).not.toMatch(/kratos|god of war|atreus|santa monica|blades of chaos|leviathan axe/i);
  });

  it('PWA icons have the right sizes', () => {
    const size = (p: string) => {
      const b = readFileSync(join(root, p));
      return [b.readUInt32BE(16), b.readUInt32BE(20)];
    };
    expect(size('public/icons/icon-192.png')).toEqual([192, 192]);
    expect(size('public/icons/icon-512.png')).toEqual([512, 512]);
    expect(size('public/icons/apple-touch-icon.png')).toEqual([180, 180]);
    expect(size('public/icons/favicon-32.png')).toEqual([32, 32]);
  });
});
