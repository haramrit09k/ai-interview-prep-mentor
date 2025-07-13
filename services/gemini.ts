import { GoogleGenAI, Type, GenerateContentResponse, HarmCategory, HarmBlockThreshold } from "@google/genai";
import type { EvaluationResponse } from '../types';
import logger from '../src/logger'; // Import the logger

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
const cleanJsonString = (str: string): string => {
  let cleaned = str.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
  }
  return cleaned.trim();
};

export const generateAnswerForQuestion = async (questionText: string): Promise<string> => {
  logger.debug('Generating answer for question:', questionText);
  try {
    const prompt = `As an expert mentor, provide a concise and clear answer for the following interview question. Be to the point. Include examples only if essential for explanation. Use markdown for formatting. Keep the tone encouraging and educational, but brief.\n\nQuestion: "${questionText}"`;

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          maxOutputTokens: 1500,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          ],
        }
    });

    logger.debug('Gemini API response for answer:', response);
    return response.text ?? "";
  } catch (error) {
    logger.error("Error generating answer:", error);
    return "Sorry, I encountered an error while generating an answer. Please try again.";
  }
};

export const evaluateAnswer = async (questionText: string, userAnswer: string): Promise<EvaluationResponse> => {
    logger.debug('Evaluating answer for question:', questionText);
    try {
        // Truncate userAnswer to prevent excessively long inputs
        const MAX_USER_ANSWER_LENGTH = 5000; // Approximately 1000 words
        const truncatedUserAnswer = userAnswer.length > MAX_USER_ANSWER_LENGTH 
            ? userAnswer.substring(0, MAX_USER_ANSWER_LENGTH) 
            : userAnswer;

        const prompt = `You are an expert interview mentor. A user is practicing for an interview.\nHere is the question they were asked, and the answer they provided.\n\nQuestion:\n---\n${questionText}\n---\n\nUser's Answer:\n---\n${truncatedUserAnswer}\n---\n\nYour tasks are:\n1. First, provide an ideal, concise answer to the question. Be brief and to the point. Use markdown for formatting and include code examples only if essential.\n2. Second, evaluate the user's answer. Provide concise, constructive feedback. Focus on the most important points for improvement. Use markdown.\n3. Third, classify the user's answer as 'correct', 'partially_correct', or 'incorrect'.\n4. Fourth, identify specific technical concepts or keywords that the user demonstrated understanding of in their answer. List them as an array of strings. If no concepts were demonstrated, return an empty array.\n5. Fifth, identify specific technical concepts or keywords related to the question that the user missed, misunderstood, or should review. List them as an array of strings. If no concepts were missed, return an empty array.\n\nReturn a JSON object with five keys:\n- "mentorAnswer": The ideal, concise answer (string, markdown formatted).\n- "feedback": Your concise, constructive feedback for the user (string, markdown formatted).\n- "classification": Your classification ('correct', 'partially_correct', 'incorrect').\n- "conceptsKnown": An array of strings, listing concepts the user demonstrated understanding of.\n- "conceptsToReview": An array of strings, listing concepts the user missed or should review.`;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: prompt,
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
        
        return result as EvaluationResponse;
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

export const generateRevisionSummary = async (knownQuestions: string[], unknownQuestions: string[]): Promise<{ conceptsKnown: string; conceptsToReview: string; }> => {
  logger.debug('Generating revision summary.', { knownQuestions, unknownQuestions });
  try {
    const prompt = `You are an expert learning assistant. A user has practiced a skill and you need to create a revision summary based on their performance.\n\nI will provide you with two lists of questions:\n1. Questions they knew or partially knew the answer to.\n2. Questions they did not know the answer to or got incorrect.\n\nYour task is to:\n- Analyze each list of questions.\n- Identify the core concepts or topics being tested in each list.\n- Generate a concise summary for each list in markdown bullet points.\n- The summary should not just be a list of the questions, but a synthesis of the underlying topics.\n\nQuestions the user KNEW:\n---\n- ${knownQuestions.join('\n- ')}\n---\n\nQuestions the user DID NOT KNOW:\n---\n- ${unknownQuestions.join('\n- ')}\n---\n\nReturn a JSON object with two keys:\n- "conceptsKnown": A summary of topics the user is comfortable with (string, markdown formatted).\n- "conceptsToReview": A summary of topics the user should focus on for revision (string, markdown formatted).`;

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
              type: Type.STRING,
              description: 'Markdown summary of concepts the user knew.',
            },
            conceptsToReview: {
              type: Type.STRING,
              description: 'Markdown summary of concepts to review.',
            },
          },
          required: ['conceptsKnown', 'conceptsToReview'],
        },
      },
    });

    logger.debug('Gemini API response for revision summary:', response);

    const jsonStr = cleanJsonString(response.text ?? "");
    if (!jsonStr) {
      throw new Error('Received empty summary from API');
    }
    return JSON.parse(jsonStr);
  } catch (error) {
    logger.error('Error generating revision summary:', error);
    return {
      conceptsKnown: 'Could not generate summary due to an error.',
      conceptsToReview: 'Could not generate summary due to an error.',
    };
  }
};