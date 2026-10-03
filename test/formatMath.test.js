const test = require('node:test');
const assert = require('node:assert/strict');

// Loaded dynamically because the source is TypeScript (Node strips the types).
let normalizeMath;
test.before(async () => {
  ({ normalizeMath } = await import('../utils/formatMath.ts'));
});

test('converts the exact complexity text that was showing raw dollar signs', () => {
  const input = [
    '* Linear Search: $O(n)$ worst/average case, $O(1)$ best case.',
    '* Binary Search: $O(\\log n)$ worst/average case, $O(1)$ best case.',
    '',
    '* Space Complexity: Both use $O(1)$ auxiliary space iteratively, though recursive binary search uses $O(\\log n)$ call stack space.',
  ].join('\n');
  const output = normalizeMath(input);
  assert.ok(!output.includes('$'));
  assert.ok(!output.includes('\\'));
  assert.match(output, /Linear Search: `O\(n\)` worst\/average case, `O\(1\)` best case\./);
  assert.match(output, /Binary Search: `O\(log n\)` worst/);
});

test('handles common LaTeX', () => {
  assert.equal(normalizeMath('$O(n \\log n)$'), '`O(n log n)`');
  assert.equal(normalizeMath('$O(n^{2})$'), '`O(n^2)`');
  assert.equal(normalizeMath('$O(2^{n+1})$'), '`O(2^(n+1))`');
  assert.equal(normalizeMath('$\\Theta(n)$ and $\\Omega(1)$'), '`Θ(n)` and `Ω(1)`');
  assert.equal(normalizeMath('$\\mathcal{O}(V + E)$'), '`O(V + E)`');
  assert.equal(normalizeMath('$a \\le b$'), '`a ≤ b`');
  assert.equal(normalizeMath('$$O(n)$$'), '`O(n)`');
  assert.equal(normalizeMath('$\\frac{n}{2}$'), '`(n)/(2)`');
});

test('leaves prices alone', () => {
  const text = 'It costs $5 and $10 per month, or $5-$10 overall.';
  assert.equal(normalizeMath(text), text);
});

test('does not touch code blocks or inline code', () => {
  const fenced = 'Run:\n```bash\necho $HOME and $PATH\n```\nDone';
  assert.equal(normalizeMath(fenced), fenced);
  const inline = 'Use `$x` and `$y` in the template.';
  assert.equal(normalizeMath(inline), inline);
  assert.equal(normalizeMath('Run `echo $HOME` then $O(n)$ happens'), 'Run `echo $HOME` then `O(n)` happens');
});

test('is safe on empty and unrelated text', () => {
  assert.equal(normalizeMath(''), '');
  assert.equal(normalizeMath('No math here.'), 'No math here.');
  assert.equal(normalizeMath('A lone $ sign'), 'A lone $ sign');
});
