const { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } = require("@google/genai");
const logger = require('./logger');

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

if (!API_KEY) {
  logger.error("GEMINI_API_KEY environment variable not set in backend geminiService.");
  throw new Error("GEMINI_API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Override with GEMINI_MODEL without a code change when Google retires or limits a model.
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

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
        maxOutputTokens: 8192,
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



const evaluateAnswer = async (questionText, userAnswer) => {
  logger.debug('Evaluating answer for question:', questionText);
  try {
      // Truncate userAnswer to prevent excessively long inputs
      const MAX_USER_ANSWER_LENGTH = 5000; // Approximately 1000 words
      const truncatedUserAnswer = userAnswer.length > MAX_USER_ANSWER_LENGTH 
          ? userAnswer.substring(0, MAX_USER_ANSWER_LENGTH) 
          : userAnswer;

      const prompt = `You are an expert interview mentor. A user is practicing for an interview.\nHere is the question they were asked, and the answer they provided.\n\nQuestion:\n---\n${questionText}\n---\n\nUser's Answer:\n---\n${truncatedUserAnswer}\n---\n\nYour tasks are:\n1. First, provide an ideal, concise answer to the question. Be brief and to the point. Use markdown for formatting and include code examples only if essential.\n2. Second, evaluate the user's answer. Provide concise, constructive feedback. Focus on the most important points for improvement. Use markdown.\n3. Third, classify the user's answer as 'correct', 'partially_correct', or 'incorrect'.\n4. Fourth, identify specific technical concepts or keywords that the user demonstrated understanding of in their answer. List them as an array of strings. If no concepts were demonstrated, return an empty array.\n5. Fifth, identify specific technical concepts or keywords related to the question that the user missed, misunderstood, or should review. List them as an array of strings. If no concepts were missed, return an empty array.\n\nReturn a JSON object with five keys:\n- "mentorAnswer": The ideal, concise answer (string, markdown formatted).\n- "feedback": Your concise, constructive feedback for the user (string, markdown formatted).\n- "classification": Your classification ('correct', 'partially_correct', 'incorrect').\n- "conceptsKnown": An array of strings, listing concepts the user demonstrated understanding of.\n- "conceptsToReview": An array of strings, listing concepts the user missed or should review.`;

      const response = await ai.models.generateContent({
          model: model,
          contents: prompt,
          config: {
              responseMimeType: "application/json",
              maxOutputTokens: 4096,
              safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
              ],
              responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                      mentorAnswer: { type: Type.STRING },
                      feedback: { type: Type.STRING },
                      classification: { type: Type.STRING, enum: ['correct', 'partially_correct', 'incorrect'] },
                      conceptsKnown: { type: Type.ARRAY, items: { type: Type.STRING } },
                      conceptsToReview: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["mentorAnswer", "feedback", "classification", "conceptsKnown", "conceptsToReview"]
              }
          }
      });

      logger.debug('Gemini API response for evaluation:', response);

      const jsonStr = cleanJsonString(response.text ?? "");
      if (!jsonStr) {
        throw new Error("Received empty response from evaluation API");
      }
      const result = JSON.parse(jsonStr);
      
      return result;
  } catch (error) {
      logger.error("Error evaluating answer:", error);
      return {
          mentorAnswer: "Sorry, I encountered an error while generating an answer. Please try again.",
          feedback: "Could not evaluate your answer due to an error.",
          classification: 'incorrect',
          conceptsKnown: [],
          conceptsToReview: []
      };
  }
};

module.exports = {
  generateQuestionsForSkill,
  evaluateAnswer,
};
