const { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } = require("@google/genai");
const logger = require('./logger');
const { buildQuestionsPrompt, buildEvaluationPrompt, TRANSCRIPTION_PROMPT } = require('./prompts');

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
    const contents = buildQuestionsPrompt(skillName, level, count);

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

      const prompt = buildEvaluationPrompt(questionText, truncatedUserAnswer);

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

      const validClassifications = ['correct', 'partially_correct', 'incorrect'];
      if (!result || typeof result.mentorAnswer !== 'string' || typeof result.feedback !== 'string' ||
          !validClassifications.includes(result.classification)) {
        throw new Error("Evaluation response was not in the expected format");
      }
      return {
        ...result,
        conceptsKnown: Array.isArray(result.conceptsKnown) ? result.conceptsKnown : [],
        conceptsToReview: Array.isArray(result.conceptsToReview) ? result.conceptsToReview : [],
      };
  } catch (error) {
      // Let the route decide how to respond. Returning a fake "incorrect" result here
      // would hide outages, charge the user quota and get cached as if it were real.
      logger.error("Error evaluating answer:", error);
      throw error;
  }
};

/**
 * Transcribes a spoken answer. The transcript is kept verbatim (fillers and repeats included)
 * because delivery coaching counts them.
 */
const transcribeAudio = async (audioBuffer, mimeType) => {
  const prompt = TRANSCRIPTION_PROMPT;

  const response = await ai.models.generateContent({
    model,
    contents: [
      { inlineData: { mimeType, data: audioBuffer.toString('base64') } },
      { text: prompt },
    ],
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
      responseSchema: {
        type: Type.OBJECT,
        properties: { transcript: { type: Type.STRING } },
        required: ["transcript"],
      },
    },
  });

  const jsonStr = cleanJsonString(response.text ?? "");
  if (!jsonStr) throw new Error("Received empty response from transcription API");
  const result = JSON.parse(jsonStr);
  return typeof result.transcript === 'string' ? result.transcript.trim() : '';
};

module.exports = {
  generateQuestionsForSkill,
  evaluateAnswer,
  transcribeAudio,
};
