import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type GenerateContentResponse, Type } from "@google/genai";

// Define EvaluationResponse type locally
export type EvaluationResponse = {
  mentorAnswer: string;
  feedback: string;
  classification: 'correct' | 'partially-correct' | 'incorrect';
  conceptsKnown: string[];
  conceptsToReview: string[];
};
import logger from '../src/logger'; // Import the logger

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

if (!API_KEY) {
  logger.error("API_KEY environment variable not set.");
  throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const model = 'gemini-2.5-flash';



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
  logger.debug('Sending evaluation request to backend for question:', questionText);
  try {
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ questionText, userAnswer }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to evaluate answer');
    }

    const result = await response.json();
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

const generateRevisionSummary = async (skillName: string, knownQuestions: string[], unknownQuestions: string[]): Promise<{ conceptsKnown: string; conceptsToReview: string; }> => {
  logger.debug('Generating revision summary.', { knownQuestions, unknownQuestions });
  try {
    const prompt = `You are an expert learning assistant. A user has practiced the skill "${skillName}" and you need to create a revision summary based on their performance.\n\nI will provide you with two lists of questions:\n1. Questions they knew or partially knew the answer to.\n2. Questions they did not know the answer to or got incorrect.\n\nYour task is to:\n- Analyze each list of questions, considering the skill "${skillName}".\n- Identify the core concepts or topics being tested in each list that are *specific to the skill "${skillName}"*.\n- Generate a *very concise and actionable* summary for each list using markdown bullet points. Each bullet point MUST start with a hyphen and a space, and each bullet point MUST be on a new line. DO NOT combine bullet points onto a single line. The output for "conceptsKnown" and "conceptsToReview" should ONLY contain these bullet points, with no introductory text.\n  Example:\n  - Concept One\n  - Another Concept\n  - Third Concept\n- Each bullet point should be a key concept or topic, not a detailed explanation.\n- The summary should synthesize the underlying topics, not just list questions.\n- Aim for 1-3 bullet points per section, if possible.\n\nQuestions the user KNEW:\n---\n- ${knownQuestions.join('\n- ')}\n---\n\nQuestions the user DID NOT KNOW:\n---\n- ${unknownQuestions.join('\n- ')}\n---\n\nReturn a JSON object with two keys:\n- "conceptsKnown": A very concise summary of topics the user is comfortable with (string, markdown formatted, ONLY bullet points).\n- "conceptsToReview": A very concise summary of topics the user should focus on for revision (string, markdown formatted, ONLY bullet points).`;


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

    // Helper function to clean and extract valid JSON from a string
    function cleanJsonString(str: string): string {
      // Try to find the first and last curly braces to extract JSON
      const firstBrace = str.indexOf('{');
      const lastBrace = str.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return str.substring(firstBrace, lastBrace + 1);
      }
      return str;
    }
    
        const jsonStr = cleanJsonString(response.text ?? "");
        if (!jsonStr) {
          throw new Error('Received empty summary from API');
        }
        const result = JSON.parse(jsonStr);

    // Post-process to ensure bullet points are on new lines
    const formatConcepts = (concepts: string) => {
      if (!concepts) return '';
      // Split by common bullet point indicators and filter out empty strings
      const parts = concepts.split(/\s*-\s*/).filter(part => part.trim() !== '');
      // Rejoin with explicit markdown bullet points on new lines
      return parts.map(part => `- ${part.trim()}`).join('\n');
    };

    return {
      conceptsKnown: formatConcepts(result.conceptsKnown),
      conceptsToReview: formatConcepts(result.conceptsToReview),
    };
  } catch (error) {
    logger.error('Error generating revision summary:', error);
    return {
      conceptsKnown: 'Could not generate summary due to an error.',
      conceptsToReview: 'Could not generate summary due to an error.',
    };
  }
};