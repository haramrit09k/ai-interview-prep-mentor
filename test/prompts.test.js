const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GEMINI_API_KEY = 'not-a-real-key';
process.env.NODE_ENV = 'test';

const {
  buildQuestionsPrompt, buildEvaluationPrompt, buildSummaryPrompt, TRANSCRIPTION_PROMPT, FORMATTING_RULES,
} = require('../server/prompts');

test('the real service modules load (no stubs), so syntax errors in them cannot hide', () => {
  const gemini = require('../server/geminiService');
  const summary = require('../server/summaryService');
  assert.equal(typeof gemini.generateQuestionsForSkill, 'function');
  assert.equal(typeof gemini.evaluateAnswer, 'function');
  assert.equal(typeof gemini.transcribeAudio, 'function');
  assert.equal(typeof summary.generateRevisionSummary, 'function');
});

test('formatting rules forbid LaTeX and ask for inline code', () => {
  assert.match(FORMATTING_RULES, /Do not use LaTeX or dollar-sign math/);
  assert.match(FORMATTING_RULES, /`O\(n log n\)`/);
});

test('evaluation prompt carries the question, the answer and the formatting rules', () => {
  const prompt = buildEvaluationPrompt('What is a closure?', 'A function with its scope.');
  assert.match(prompt, /Question:\n---\nWhat is a closure\?\n---/);
  assert.match(prompt, /User's Answer:\n---\nA function with its scope\.\n---/);
  assert.ok(prompt.includes(FORMATTING_RULES));
  for (const key of ['mentorAnswer', 'feedback', 'classification', 'conceptsKnown', 'conceptsToReview']) {
    assert.ok(prompt.includes(`"${key}"`), key);
  }
  assert.match(prompt, /'correct', 'partially_correct', or 'incorrect'/);
});

test('questions prompt uses level specific guidance and asks for plain text', () => {
  const entry = buildQuestionsPrompt('Java', 'Entry-level', 5);
  assert.match(entry, /for the topic: "Java"/);
  assert.match(entry, /Generate exactly 5 interview questions/);
  assert.match(entry, /beginner/);
  assert.match(buildQuestionsPrompt('Java', 'Mid-level', 3), /some industry experience/);
  assert.match(buildQuestionsPrompt('Java', 'Expert', 3), /seasoned expert/);
  assert.match(entry, /plain text.*no numbering, Markdown or LaTeX/);
});

test('summary prompt handles empty lists on either side', () => {
  const both = buildSummaryPrompt('Go', ['What is a goroutine?'], ['What is a channel?']);
  assert.match(both, /Questions the user KNEW:\n---\n- What is a goroutine\?/);
  assert.match(both, /Questions the user DID NOT KNOW:\n---\n- What is a channel\?/);
  assert.match(both, /Do not use Markdown or LaTeX/);
  assert.match(buildSummaryPrompt('Go', [], ['q']), /did not have any questions they knew/);
  assert.match(buildSummaryPrompt('Go', ['q'], []), /did not have any questions they did not know/);
});

test('transcription prompt keeps filler words verbatim', () => {
  assert.match(TRANSCRIPTION_PROMPT, /filler words \(um, uh, like, you know\)/);
  assert.match(TRANSCRIPTION_PROMPT, /Do not correct grammar/);
});
