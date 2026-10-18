/** Copy text, with a fallback for browsers without the async clipboard API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

export const CLAUDE_URL = 'https://claude.ai/new';

/** Opens Claude in a new tab (on iPhone, the Claude app opens if it handles claude.ai links). */
export function openClaude(): void {
  window.open(CLAUDE_URL, '_blank', 'noopener,noreferrer');
}
