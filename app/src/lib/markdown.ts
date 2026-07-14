/**
 * A small Markdown subset parser for model replies.
 *
 * Deliberately not a full CommonMark implementation: it covers what a 1B–3B
 * instruct model actually emits (fenced code, headings, lists, bold/italic,
 * inline code) and is re-run on every streamed token, so it stays linear and
 * allocation-light. An unterminated fence — the normal state while a code block
 * is still streaming — is treated as an open code block rather than as text.
 */

export interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type MdBlock =
  | { kind: 'code'; lang: string; code: string; open: boolean }
  | { kind: 'heading'; level: number; spans: InlineSpan[] }
  | { kind: 'list'; ordered: boolean; items: InlineSpan[][] }
  | { kind: 'quote'; spans: InlineSpan[] }
  | { kind: 'rule' }
  | { kind: 'para'; spans: InlineSpan[] };

const FENCE = /^\s*```(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*(?:---+|\*\*\*+|___+)\s*$/;

/** Splits a line into styled spans: `code`, **bold**, *italic*. */
export function parseInline(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) {
      spans.push({ text: buf });
      buf = '';
    }
  };
  while (i < line.length) {
    const rest = line.slice(i);

    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      spans.push({ text: code[1], code: true });
      i += code[0].length;
      continue;
    }
    const bold = /^(\*\*|__)(.+?)\1/.exec(rest);
    if (bold) {
      flush();
      spans.push({ text: bold[2], bold: true });
      i += bold[0].length;
      continue;
    }
    const italic = /^(\*|_)(?!\s)(.+?)\1/.exec(rest);
    if (italic) {
      flush();
      spans.push({ text: italic[2], italic: true });
      i += italic[0].length;
      continue;
    }
    // Markdown links: keep the label, drop the URL — a chat bubble is not a
    // browser, and a small offline model's URLs are usually hallucinated anyway.
    const link = /^\[([^\]]+)\]\([^)]*\)/.exec(rest);
    if (link) {
      flush();
      spans.push({ text: link[1] });
      i += link[0].length;
      continue;
    }
    buf += line[i];
    i += 1;
  }
  flush();
  return spans.length ? spans : [{ text: '' }];
}

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: 'para', spans: parseInline(para.join(' ')) });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = FENCE.exec(line);
    if (fence) {
      flushPara();
      const lang = fence[1].trim();
      const code: string[] = [];
      let closed = false;
      i++;
      for (; i < lines.length; i++) {
        if (FENCE.test(lines[i])) {
          closed = true;
          break;
        }
        code.push(lines[i]);
      }
      blocks.push({
        kind: 'code',
        lang,
        code: code.join('\n').replace(/\s+$/, ''),
        open: !closed,
      });
      continue;
    }

    if (!line.trim()) {
      flushPara();
      continue;
    }

    if (RULE.test(line)) {
      flushPara();
      blocks.push({ kind: 'rule' });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushPara();
      blocks.push({
        kind: 'heading',
        level: heading[1].length,
        spans: parseInline(heading[2]),
      });
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      flushPara();
      blocks.push({ kind: 'quote', spans: parseInline(quote[1]) });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      flushPara();
      const isOrdered = !bullet;
      const items: InlineSpan[][] = [];
      for (; i < lines.length; i++) {
        const b = BULLET.exec(lines[i]);
        const o = ORDERED.exec(lines[i]);
        const m = isOrdered ? o : b;
        // A different marker starts a different list.
        if (!m || (isOrdered ? !!b : !!o)) break;
        items.push(parseInline(m[1]));
      }
      i -= 1;
      blocks.push({ kind: 'list', ordered: isOrdered, items });
      continue;
    }

    para.push(line.trim());
  }
  flushPara();
  return blocks;
}
