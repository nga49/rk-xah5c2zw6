import { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type { ScreenProps } from '../App';
import { contextPack } from '../engine/context';
import { QUICK_PROMPTS } from '../plan/content';
import { copyText, openClaude } from '../ui/clipboard';
import { Card, Fold, Sheet } from '../ui/kit';

export function Ask({ data, view, initial, onClose }: ScreenProps & { initial?: string; onClose: () => void }) {
  const [q, setQ] = useState(initial ?? '');
  const [copied, setCopied] = useState(false);
  const pack = useMemo(() => contextPack(view, data, q), [view, data, q]);
  const go = async () => {
    const ok = await copyText(pack);
    setCopied(ok);
    if (ok) openClaude();
  };
  return (
    <Sheet open title="Ask Claude" onClose={onClose}>
      <div className="stack">
        <div className="chips">
          {QUICK_PROMPTS.map((p) => (
            <button key={p} className={`chip ${q === p ? 't-frost solid' : 't-frost'}`} onClick={() => { setQ(p); setCopied(false); }}>{p}</button>
          ))}
        </div>
        <textarea className="input" rows={3} placeholder="Or ask anything" value={q} onChange={(e) => { setQ(e.target.value); setCopied(false); }} aria-label="Your question" />
        <button className="btn frost block" onClick={() => void go()}>
          {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'Copied. Paste it in Claude.' : 'Copy and open Claude'}
        </button>
        {copied && (
          <a className="btn block" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">
            Claude did not open? Open Claude <ExternalLink size={14} />
          </a>
        )}
        <Card>
          <Fold title={<span className="small muted">What gets copied ({pack.length.toLocaleString('en-US')} characters)</span>}>
            <pre className="tiny" style={{ whiteSpace: 'pre-wrap', margin: '0 0 10px', fontFamily: 'var(--body)', color: 'var(--muted)' }}>{pack}</pre>
          </Fold>
        </Card>
        <div className="tiny muted center">Nothing is sent by the app. You paste it yourself. Not medical advice.</div>
      </div>
    </Sheet>
  );
}
