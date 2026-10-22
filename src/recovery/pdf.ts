// A minimal PDF 1.4 writer, on the device: standard Helvetica fonts, text, lines and simple tables.
// No library and no network. Text is mapped to plain ASCII so the built-in fonts can show it.

const W = 595;
const H = 842;
const M = 50;

// Typographic characters mapped to plain ASCII, keyed by code point (x, deg, dots, quotes, dashes, arrows, ellipsis).
const ASCII: Record<number, string> = { 0xd7: 'x', 0xb0: ' deg', 0xb7: '-', 0x2019: "'", 0x2018: "'", 0x201c: '"', 0x201d: '"', 0x2013: '-', 0x2014: '-', 0x2192: '->', 0x2191: '+', 0x2193: '-', 0x2026: '...' };
export function pdfText(s: string): string {
  const plain = [...s].map((c) => {
    const code = c.codePointAt(0) ?? 63;
    return ASCII[code] ?? (code < 32 || code > 126 ? '?' : c);
  }).join('');
  return plain.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Flow layout: headings, paragraphs, label and value rows, tables and a small line chart. */
export class PdfWriter {
  private pages: string[][] = [[]];
  private y = H - M;

  private get ops(): string[] {
    return this.pages[this.pages.length - 1];
  }

  private need(h: number): void {
    if (this.y - h < M) {
      this.pages.push([]);
      this.y = H - M;
    }
  }

  private put(x: number, y: number, size: number, text: string, bold = false, gray = 0): void {
    this.ops.push(`BT ${gray} g /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfText(text)}) Tj ET`);
  }

  private rule(x1: number, y1: number, x2: number, y2: number, gray = 0.75, width = 0.6): void {
    this.ops.push(`${gray} G ${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
  }

  /** Wrap by an average Helvetica glyph width (about half the font size). */
  static wrap(text: string, size: number, width: number): string[] {
    const max = Math.max(10, Math.floor(width / (size * 0.5)));
    const out: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        if ((line + ' ' + word).trim().length > max) {
          if (line) out.push(line);
          line = word;
        } else line = (line + ' ' + word).trim();
      }
      out.push(line);
    }
    return out;
  }

  h1(text: string): void {
    this.need(30);
    this.put(M, this.y - 18, 18, text, true);
    this.y -= 26;
    this.rule(M, this.y, W - M, this.y, 0.3, 1);
    this.y -= 10;
  }

  h2(text: string): void {
    this.need(28);
    this.y -= 8;
    this.put(M, this.y - 12, 12, text, true);
    this.y -= 18;
  }

  p(text: string, size = 10, gray = 0): void {
    for (const line of PdfWriter.wrap(text, size, W - 2 * M)) {
      this.need(size + 4);
      this.put(M, this.y - size, size, line, false, gray);
      this.y -= size + 4;
    }
  }

  kv(label: string, value: string): void {
    const lines = PdfWriter.wrap(value, 10, W - 2 * M - 150);
    this.need(14 * lines.length);
    this.put(M, this.y - 10, 10, label, true);
    lines.forEach((l, i) => this.put(M + 150, this.y - 10 - i * 14, 10, l));
    this.y -= 14 * lines.length;
  }

  table(headers: string[], rows: string[][], widths: number[]): void {
    const row = (cells: string[], bold: boolean) => {
      this.need(14);
      let x = M;
      cells.forEach((c, i) => {
        this.put(x, this.y - 10, 9, c, bold);
        x += widths[i];
      });
      this.y -= 14;
    };
    row(headers, true);
    this.rule(M, this.y + 2, M + widths.reduce((a, b) => a + b, 0), this.y + 2);
    for (const r of rows) row(r, false);
    this.y -= 4;
  }

  /** A small chart on a fixed 0 to 10 scale, one dashed line at the pain rule. */
  chart(series: { name: string; gray: number; points: number[] }[], labels: [string, string], rule = 3): void {
    const h = 120;
    const w = W - 2 * M - 30;
    this.need(h + 34);
    const x0 = M + 24;
    const y0 = this.y - h;
    for (const v of [0, 5, 10]) {
      const y = y0 + (h * v) / 10;
      this.rule(x0, y, x0 + w, y, 0.88);
      this.put(M, y - 3, 8, String(v), false, 0.4);
    }
    const yr = y0 + (h * rule) / 10;
    this.ops.push(`0.5 G [3 3] 0 d 0.8 w ${x0.toFixed(1)} ${yr.toFixed(1)} m ${(x0 + w).toFixed(1)} ${yr.toFixed(1)} l S [] 0 d`);
    const n = Math.max(...series.map((s) => s.points.length), 2);
    for (const s of series) {
      const pts = s.points.map((v, i) => [x0 + (w * i) / (n - 1), y0 + (h * Math.max(0, Math.min(10, v))) / 10] as const);
      if (pts.length > 1) this.ops.push(`${s.gray} G 1.6 w ${pts.map(([x, y], i) => `${x.toFixed(1)} ${y.toFixed(1)} ${i ? 'l' : 'm'}`).join(' ')} S`);
      for (const [x, y] of pts) this.ops.push(`${s.gray} g ${(x - 1.6).toFixed(1)} ${(y - 1.6).toFixed(1)} 3.2 3.2 re f`);
    }
    this.put(x0, y0 - 12, 8, labels[0], false, 0.4);
    this.put(x0 + w - 40, y0 - 12, 8, labels[1], false, 0.4);
    let lx = x0 + 70;
    for (const s of series) {
      this.put(lx, y0 - 12, 8, s.name, true, s.gray);
      lx += 60;
    }
    this.y = y0 - 24;
  }

  /** The finished file as bytes (ASCII only, so byte offsets equal string offsets). */
  bytes(footer: string): Uint8Array {
    const total = this.pages.length;
    const objs: string[] = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    const kids: number[] = [];
    this.pages.forEach((ops, i) => {
      const content = [...ops, `BT 0.45 g /F1 8 Tf ${M} 28 Td (${pdfText(`${footer} - page ${i + 1} of ${total}`)}) Tj ET`].join('\n');
      const pageNo = 5 + i * 2;
      objs[pageNo] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageNo + 1} 0 R >>`;
      objs[pageNo + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
      kids.push(pageNo);
    });
    objs[2] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${total} >>`;
    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let i = 1; i < objs.length; i++) {
      offsets[i] = out.length;
      out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(out);
  }
}
