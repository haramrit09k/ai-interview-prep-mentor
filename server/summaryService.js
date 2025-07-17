const { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } = require("@google/genai");
const logger = require('./logger');

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

if (!API_KEY) {
  logger.error("API_KEY environment variable not set.");
  throw new Error("API_KEY environment variable not set.");
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

const generateRevisionSummary = async (skillName, knownQuestions, unknownQuestions) => {
  logger.debug('Generating revision summary.', { skillName, knownQuestions, unknownQuestions });

  // If there are no questions, don't call the API.
  if (knownQuestions.length === 0 && unknownQuestions.length === 0) {
    logger.info('No questions provided for revision summary. Returning default message.');
    return {
      conceptsKnown: 'No questions were answered in this session.',
      conceptsToReview: 'Complete a few questions to get a personalized revision plan.',
    };
  }

  try {
    let prompt = `You are an expert learning assistant. A user has practiced the skill "${skillName}" and you need to create a revision summary based on their performance.\n\nI will provide you with lists of questions based on their answers.\n\nYour task is to:\n- Analyze the questions, considering the skill "${skillName}".\n- Identify the core concepts or topics being tested. Return the concepts as an array of strings.\n- Each item in the array should be a key concept or topic, not a detailed explanation.\n- The summary should synthesize the underlying topics, not just list questions.\n- Aim for 1-3 concepts per section, if possible.\n\n`;

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

    prompt += `Return a JSON object with two keys:\n- "conceptsKnown": An array of strings, representing concepts the user is comfortable with. If there were no known questions, return an empty array.\n- "conceptsToReview": An array of strings, representing concepts the user should focus on for revision. If there were no unknown questions, return an empty array.`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
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
            conceptsKnown: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Array of concepts the user knew.',
            },
            conceptsToReview: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Array of concepts to review.',
            },
          },
          required: ['conceptsKnown', 'conceptsToReview'],
        },
      },
    });

    logger.debug('Gemini API response for revision summary:', JSON.stringify(response, null, 2));

    if (!response || !response.response || !response.response.candidates || !response.response.candidates[0].content || !response.response.candidates[0].content.parts || !response.response.candidates[0].content.parts[0].text) {
      throw new Error('Invalid or empty response from Gemini API');
    }

    const responseText = response.response.candidates[0].content.parts[0].text;
    const jsonStr = cleanJsonString(responseText ?? "");
    if (!jsonStr) {
      throw new Error('Received empty summary from API');
    }
    const result = JSON.parse(jsonStr);

    return {
      conceptsKnown: result.conceptsKnown.map(c => `- ${c.trim()}`).join('\n'),
      conceptsToReview: result.conceptsToReview.map(c => `- ${c.trim()}`).join('\n')
    };
  } catch (error) {
    logger.error('Error generating revision summary:', error);
    // Re-throw the error to be caught by the route handler
    throw error;
  }
};

module.exports = { generateRevisionSummary };