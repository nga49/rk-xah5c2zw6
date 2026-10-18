/* The private backup repository, through the GitHub REST contents API.
   GitHub allows these calls from any origin (CORS). The fine-grained token needs
   "Contents: Read and write" on that one repository, and lives only on this device. */

const API = 'https://api.github.com';

export interface GhConfig {
  user: string;
  repo: string;
  token: string;
}

export class GhError extends Error {
  constructor(public code: 'OFFLINE' | 'AUTH' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'RATE' | 'HTTP', message: string) {
    super(message);
  }
}

export function friendly(e: unknown): string {
  if (e instanceof GhError) {
    switch (e.code) {
      case 'OFFLINE': return 'Offline. It will retry.';
      case 'AUTH': return 'GitHub refused the token. Paste a new one.';
      case 'FORBIDDEN': return 'The token cannot write to that repository. Check its access.';
      case 'NOT_FOUND': return 'Repository not found. Check the username and repo name.';
      case 'RATE': return 'GitHub rate limit. It will retry later.';
      case 'CONFLICT': return 'The file changed meanwhile. It will retry.';
      default: return e.message;
    }
  }
  return e instanceof Error ? e.message : String(e);
}

const repoPath = (c: GhConfig) => `/repos/${encodeURIComponent(c.user.trim())}/${encodeURIComponent(c.repo.trim())}`;

async function call(c: GhConfig, method: string, path: string, body?: unknown, accept = 'application/vnd.github+json'): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      method,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        Accept: accept,
        Authorization: `Bearer ${c.token.trim()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new GhError('OFFLINE', 'Offline');
  }
  if (res.ok) return res;
  let detail = '';
  try {
    detail = ((await res.json()) as { message?: string }).message ?? '';
  } catch {
    /* no body */
  }
  if (res.status === 401) throw new GhError('AUTH', detail);
  if (res.status === 429 || (res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail)))) throw new GhError('RATE', detail);
  if (res.status === 403) throw new GhError('FORBIDDEN', detail);
  if (res.status === 404) throw new GhError('NOT_FOUND', detail);
  if (res.status === 409 || res.status === 422) throw new GhError('CONFLICT', detail);
  throw new GhError('HTTP', `${res.status} ${detail}`.trim());
}

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** The file's current sha and text, or null if it does not exist yet. Files over 1 MB come back via the raw media type. */
export async function getFile(c: GhConfig, path: string): Promise<{ sha: string; text: string } | null> {
  let res: Response;
  try {
    res = await call(c, 'GET', `${repoPath(c)}/contents/${path}`);
  } catch (e) {
    if (e instanceof GhError && e.code === 'NOT_FOUND') {
      await call(c, 'GET', repoPath(c)); // throws NOT_FOUND if the repository itself is unreachable
      return null;
    }
    throw e;
  }
  const meta = (await res.json()) as { sha: string; content?: string; encoding?: string };
  if (meta.encoding === 'base64' && meta.content) return { sha: meta.sha, text: fromBase64(meta.content) };
  const raw = await call(c, 'GET', `${repoPath(c)}/contents/${path}`, undefined, 'application/vnd.github.raw+json');
  return { sha: meta.sha, text: await raw.text() };
}

async function shaOf(c: GhConfig, path: string): Promise<string | undefined> {
  try {
    const res = await call(c, 'GET', `${repoPath(c)}/contents/${path}`);
    return ((await res.json()) as { sha: string }).sha;
  } catch (e) {
    if (e instanceof GhError && e.code === 'NOT_FOUND') return undefined;
    throw e;
  }
}

/** Create or update a file, with the current sha for updates. Retries once if it changed meanwhile. */
export async function putFile(c: GhConfig, path: string, text: string, message: string): Promise<void> {
  const content = toBase64(text);
  for (let attempt = 0; attempt < 2; attempt++) {
    const sha = await shaOf(c, path);
    try {
      await call(c, 'PUT', `${repoPath(c)}/contents/${path}`, { message, content, ...(sha ? { sha } : {}) });
      return;
    } catch (e) {
      if (!(e instanceof GhError && e.code === 'CONFLICT') || attempt === 1) throw e;
    }
  }
}

/** Checks that the token can see the repository. */
export async function checkAccess(c: GhConfig): Promise<{ private: boolean; push: boolean }> {
  const res = await call(c, 'GET', repoPath(c));
  const j = (await res.json()) as { private: boolean; permissions?: { push?: boolean } };
  return { private: !!j.private, push: !!j.permissions?.push };
}
