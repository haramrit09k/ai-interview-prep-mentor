// Gemini sometimes writes math in LaTeX, e.g. "$O(n \log n)$". Our Markdown renderer has no math
// support, so those show up with literal dollar signs and backslashes. This turns simple inline
// math into plain text inside inline code, which reads fine and needs no extra library.
// Code blocks and existing code spans are left alone so things like shell "$HOME" survive.

const SYMBOLS: Record<string, string> = {
  cdot: '·', times: '×', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠', approx: '≈',
  infty: '∞', Theta: 'Θ', theta: 'θ', Omega: 'Ω', omega: 'ω', Sigma: 'Σ', sum: 'Σ', pi: 'π',
  to: '→', rightarrow: '→', leftarrow: '←', pm: '±', ldots: '...', dots: '...',
};

const toPlainText = (latex: string): string => {
  let text = latex;
  // \frac{a}{b} -> (a)/(b)
  text = text.replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
  // \mathcal{O}, \mathrm{x}, \text{x}, \operatorname{x} -> x
  text = text.replace(/\\(?:mathcal|mathrm|mathbf|mathit|text|textit|textbf|operatorname)\s*\{([^{}]*)\}/g, '$1');
  // \sqrt{x} -> sqrt(x)
  text = text.replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)');
  // spacing and sizing commands
  text = text.replace(/\\(?:left|right|big|Big|bigg|Bigg)\b/g, '').replace(/\\[,;:! ]/g, ' ');
  // named symbols and functions (\log -> log, \Theta -> Θ)
  text = text.replace(/\\([A-Za-z]+)/g, (_, name: string) => SYMBOLS[name] ?? name);
  // ^{2} -> ^2, ^{n+1} -> ^(n+1), same for subscripts
  text = text.replace(/([\^_])\{([^{}]*)\}/g, (_, op: string, body: string) => (body.length === 1 ? `${op}${body}` : `${op}(${body})`));
  return text.replace(/\s+/g, ' ').trim();
};

// Anything that is clearly math: starts and ends with a non-space and contains a letter, a backslash or a caret.
// That keeps "$5 and $10" and "$5-$10" (prices) from being treated as math.
const looksLikeMath = (inner: string): boolean =>
  inner.length > 0 &&
  inner.length <= 160 &&
  !/^\s|\s$/.test(inner) &&
  !inner.includes('`') &&
  /[A-Za-z\\^]/.test(inner);

const convertSegment = (segment: string): string =>
  segment
    .replace(/\$\$([^$\n]+?)\$\$/g, (match, inner: string) => (looksLikeMath(inner.trim()) ? `\`${toPlainText(inner)}\`` : match))
    .replace(/\$([^$\n]+?)\$/g, (match, inner: string) => (looksLikeMath(inner) ? `\`${toPlainText(inner)}\`` : match));

export const normalizeMath = (markdown: string): string => {
  if (!markdown || !markdown.includes('$')) return markdown;
  // Odd entries of the split are code (fenced blocks or inline code spans); leave those untouched.
  return markdown
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, index) => (index % 2 === 1 ? part : convertSegment(part)))
    .join('');
};
