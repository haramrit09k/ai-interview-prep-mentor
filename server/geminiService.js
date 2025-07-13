const { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } = require("@google/genai");
const logger = require('./logger');

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

if (!API_KEY) {
  logger.error("GEMINI_API_KEY environment variable not set in backend geminiService.");
  throw new Error("GEMINI_API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const model = 'gemini-2.5-flash';

/**
 * Cleans a string that might contain a JSON object wrapped in markdown.
 * e.g., ```json\n{"key": "value"}\n``` -> {"key": "value"}
 * @param str The string to clean.
 * @returns A cleaned string, ready for parsing.
 */
const cleanJsonString = (str) => {
  let cleaned = str.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
  }
  return cleaned.trim();
};

const generateQuestionsForSkill = async (skillName, level, count, skillId) => {
  logger.debug('Generating questions for skill:', { skillName, level, count, skillId });
  try {
    let levelSpecificInstructions = '';

    switch (level) {
      case 'Entry-level':
        levelSpecificInstructions = `
          The user is a beginner. Ask fundamental, definition-based questions.
          - Focus on core concepts, syntax, and basic principles.
          - For a topic like 'Java', examples would be "What are the core principles of OOP?", "What is the difference between == and equals()?", or "What are checked vs. unchecked exceptions?".
          - The questions should be straightforward and test foundational knowledge. Avoid complex, multi-part scenarios.
        `;
        break;
      case 'Mid-level':
        levelSpecificInstructions = `
          The user has some industry experience. Ask practical questions that require applying concepts.
          - Focus on use cases, comparisons between technologies, and simple problem-solving or code analysis.
          - For a topic like 'Java', examples would be "When would you prefer using a LinkedList over an ArrayList and why?", "How would you ensure a method is thread-safe?", or asking them to find a bug in a small code snippet.
          - The questions should bridge the gap between pure definition and complex design.
        `;
        break;
      case 'Expert':
        levelSpecificInstructions = `
          The user is a seasoned expert. Ask advanced, real-world, and scenario-based questions.
          - Focus on system design, architecture, performance trade-offs, and handling complex problems at scale.
          - For a topic like 'Java', an example would be "Imagine you need to fetch data from multiple web APIs concurrently. How would you approach this using basic concurrency features?".
          - The questions should test deep knowledge and experience.
        `;
        break;
    }
    
    const contents = `You are an expert interviewer with a mentoring approach. Your goal is to help an engineer prepare for an interview for the topic: "${skillName}".

Generate exactly ${count} interview questions appropriate for a candidate at the "${level}" experience level.

Follow these specific instructions for the experience level:
${levelSpecificInstructions}
`;

    const response = await ai.models.generateContent({
      model: model,
      contents: contents,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 1500,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ],
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              description: `A list of ${count} interview questions for a ${level} candidate.`,
              items: { type: Type.STRING, description: "An interview question." }
            }
          },
          required: ["questions"]
        }
      }
    });
    
    logger.debug('Gemini API response for questions:', response);

    const jsonStr = cleanJsonString(response.text ?? "");
    if (!jsonStr) {
      logger.warn("Gemini response for questions was empty.", { skillName });
      return [];
    }

    const result = JSON.parse(jsonStr);
    
    if (result && Array.isArray(result.questions)) {
      logger.info(`Generated ${result.questions.length} questions for ${skillName} (${level}).`);
      return result.questions.filter((q) => typeof q === 'string' && q.trim()).map(q => ({ text: q, level, skillId }));
    }
    
    logger.warn("Gemini response for questions was not in the expected format.", { skillName, result });
    return [];

  } catch (error) {
    logger.error(`Error generating interview questions for ${skillName}:`, error);
    throw new Error(`Failed to generate questions for ${skillName}`);
  }
};

module.exports = {
  generateQuestionsForSkill,
};