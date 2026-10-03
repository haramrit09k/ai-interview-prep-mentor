// Every prompt sent to the model lives here, so they can be read, reviewed and tested in one place.
// Responses are requested as JSON through a response schema in the calling service.

// Shown to the user through a Markdown renderer. Models like to write math as LaTeX ("$O(n)$"),
// which would print as raw dollar signs, so we ask for plain text in inline code instead.
const FORMATTING_RULES = `Formatting rules for every text field you return:
- Use Markdown. Prefer short paragraphs and "-" bullet lists.
- Do not use LaTeX or dollar-sign math. Write complexity and formulas as plain text inside inline code, for example \`O(n log n)\` or \`2^n\`.
- Put code in fenced code blocks with a language tag.`;

const LEVEL_INSTRUCTIONS = {
  'Entry-level': `
          The user is a beginner. Ask fundamental, definition-based questions.
          - Focus on core concepts, syntax, and basic principles.
          - For a topic like 'Java', examples would be "What are the core principles of OOP?", "What is the difference between == and equals()?", or "What are checked vs. unchecked exceptions?".
          - The questions should be straightforward and test foundational knowledge. Avoid complex, multi-part scenarios.
        `,
  'Mid-level': `
          The user has some industry experience. Ask practical questions that require applying concepts.
          - Focus on use cases, comparisons between technologies, and simple problem-solving or code analysis.
          - For a topic like 'Java', examples would be "When would you prefer using a LinkedList over an ArrayList and why?", "How would you ensure a method is thread-safe?", or asking them to find a bug in a small code snippet.
          - The questions should bridge the gap between pure definition and complex design.
        `,
  'Expert': `
          The user is a seasoned expert. Ask advanced, real-world, and scenario-based questions.
          - Focus on system design, architecture, performance trade-offs, and handling complex problems at scale.
          - For a topic like 'Java', an example would be "Imagine you need to fetch data from multiple web APIs concurrently. How would you approach this using basic concurrency features?".
          - The questions should test deep knowledge and experience.
        `,
};

/** Asks for interview questions on one skill at one experience level. */
const buildQuestionsPrompt = (skillName, level, count) => `You are an expert interviewer with a mentoring approach. Your goal is to help an engineer prepare for an interview for the topic: "${skillName}".

Generate exactly ${count} interview questions appropriate for a candidate at the "${level}" experience level.

Follow these specific instructions for the experience level:
${LEVEL_INSTRUCTIONS[level] || ''}

Write each question as plain text on its own, with no numbering, Markdown or LaTeX.
`;

/** Asks for a model answer, feedback, a classification and the concepts shown or missed. */
const buildEvaluationPrompt = (questionText, userAnswer) => `You are an expert interview mentor. A user is practicing for an interview.
Here is the question they were asked, and the answer they provided.

Question:
---
${questionText}
---

User's Answer:
---
${userAnswer}
---

Your tasks are:
1. First, provide an ideal, concise answer to the question. Be brief and to the point. Use markdown for formatting and include code examples only if essential.
2. Second, evaluate the user's answer. Provide concise, constructive feedback. Focus on the most important points for improvement. Use markdown.
3. Third, classify the user's answer as 'correct', 'partially_correct', or 'incorrect'.
4. Fourth, identify specific technical concepts or keywords that the user demonstrated understanding of in their answer. List them as an array of strings. If no concepts were demonstrated, return an empty array.
5. Fifth, identify specific technical concepts or keywords related to the question that the user missed, misunderstood, or should review. List them as an array of strings. If no concepts were missed, return an empty array.

${FORMATTING_RULES}

Return a JSON object with five keys:
- "mentorAnswer": The ideal, concise answer (string, markdown formatted).
- "feedback": Your concise, constructive feedback for the user (string, markdown formatted).
- "classification": Your classification ('correct', 'partially_correct', 'incorrect').
- "conceptsKnown": An array of strings, listing concepts the user demonstrated understanding of.
- "conceptsToReview": An array of strings, listing concepts the user missed or should review.`;

/** Asks for a short revision summary from the questions a user knew and did not know. */
const buildSummaryPrompt = (skillName, knownQuestions, unknownQuestions) => {
  let prompt = `You are an expert learning assistant. A user has practiced the skill "${skillName}" and you need to create a revision summary based on their performance.

I will provide you with lists of questions based on their answers.

Your task is to:
- Analyze the questions, considering the skill "${skillName}".
- Identify the core concepts or topics being tested. Return the concepts as an array of strings.
- Each item in the array should be a key concept or topic, not a detailed explanation.
- The summary should synthesize the underlying topics, not just list questions.
- Aim for 1-3 concepts per section, if possible.
- Write each concept as short plain text. Do not use Markdown or LaTeX.

`;

  if (knownQuestions.length > 0) {
    prompt += `Questions the user KNEW:\n---\n- ${knownQuestions.join('\n- ')}\n---\n\n`;
  } else {
    prompt += `The user did not have any questions they knew.\n\n`;
  }

  if (unknownQuestions.length > 0) {
    prompt += `Questions the user DID NOT KNOW:\n---\n- ${unknownQuestions.join('\n- ')}\n---\n\n`;
  } else {
    prompt += `The user did not have any questions they did not know.\n\n`;
  }

  prompt += `Return a JSON object with two keys:
- "conceptsKnown": An array of strings, representing concepts the user is comfortable with. If there were no known questions, return an empty array.
- "conceptsToReview": An array of strings, representing concepts the user should focus on for revision. If there were no unknown questions, return an empty array.`;
  return prompt;
};

/** Verbatim transcription. Fillers are kept on purpose because delivery coaching counts them. */
const TRANSCRIPTION_PROMPT = `Transcribe this audio exactly as spoken, word for word. Keep filler words (um, uh, like, you know), repeated words and false starts exactly as they were said. Do not correct grammar, rephrase or summarise. Use basic punctuation only. If there is no intelligible speech, return an empty transcript. Return JSON with one key, "transcript".`;

module.exports = { buildQuestionsPrompt, buildEvaluationPrompt, buildSummaryPrompt, TRANSCRIPTION_PROMPT, FORMATTING_RULES };
