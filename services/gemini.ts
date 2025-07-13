
import { GoogleGenAI, Type, GenerateContentResponse, HarmCategory, HarmBlockThreshold } from "@google/genai";
import type { EvaluationResponse, ExperienceLevel } from '../types';

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

if (!API_KEY) {
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

export const generateQuestionsForSkill = async (skillName: string, level: ExperienceLevel, count: number): Promise<string[]> => {
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

    const response: GenerateContentResponse = await ai.models.generateContent({
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
    
    const jsonStr = cleanJsonString(response.text ?? "");
    if (!jsonStr) {
      console.warn("Gemini response for questions was empty.", { skillName });
      return [];
    }

    const result = JSON.parse(jsonStr);
    
    if (result && Array.isArray(result.questions)) {
      return result.questions.filter((q: unknown) => typeof q === 'string' && q.trim());
    }
    
    console.warn("Gemini response for questions was not in the expected format.", { skillName, result });
    return [];

  } catch (error) {
    console.error(`Error generating interview questions for ${skillName}:`, error);
    // Re-throw the error so the UI can handle it, e.g., show an alert
    throw new Error(`Failed to generate questions for ${skillName}`);
  }
};

export const generateAnswerForQuestion = async (questionText: string): Promise<string> => {
  try {
    const prompt = `As an expert mentor, provide a concise and clear answer for the following interview question. Be to the point. Include examples only if essential for explanation. Use markdown for formatting. Keep the tone encouraging and educational, but brief.

Question: "${questionText}"`;

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

    return response.text ?? "";
  } catch (error) {
    console.error("Error generating answer:", error);
    return "Sorry, I encountered an error while generating an answer. Please try again.";
  }
};

export const evaluateAnswer = async (questionText: string, userAnswer: string): Promise<EvaluationResponse> => {
    try {
        // Truncate userAnswer to prevent excessively long inputs
        const MAX_USER_ANSWER_LENGTH = 5000; // Approximately 1000 words
        const truncatedUserAnswer = userAnswer.length > MAX_USER_ANSWER_LENGTH 
            ? userAnswer.substring(0, MAX_USER_ANSWER_LENGTH) 
            : userAnswer;

        const prompt = `You are an expert interview mentor. A user is practicing for an interview.
Here is the question they were asked, and the answer they provided.

Question:
---
${questionText}
---

User's Answer:
---
${truncatedUserAnswer}
---

Your tasks are:
1. First, provide an ideal, concise answer to the question. Be brief and to the point. Use markdown for formatting and include code examples only if essential.
2. Second, evaluate the user's answer. Provide concise, constructive feedback. Focus on the most important points for improvement. Use markdown.
3. Third, classify the user's answer as 'correct', 'partially_correct', or 'incorrect'.
4. Fourth, identify specific technical concepts or keywords that the user demonstrated understanding of in their answer. List them as an array of strings. If no concepts were demonstrated, return an empty array.
5. Fifth, identify specific technical concepts or keywords related to the question that the user missed, misunderstood, or should review. List them as an array of strings. If no concepts were missed, return an empty array.

Return a JSON object with five keys:
- "mentorAnswer": The ideal, concise answer (string, markdown formatted).
- "feedback": Your concise, constructive feedback for the user (string, markdown formatted).
- "classification": Your classification ('correct', 'partially_correct', 'incorrect').
- "conceptsKnown": An array of strings, listing concepts the user demonstrated understanding of.
- "conceptsToReview": An array of strings, listing concepts the user missed or should review.`;

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

        const jsonStr = cleanJsonString(response.text ?? "");
        if (!jsonStr) {
          throw new Error("Received empty response from evaluation API");
        }
        const result = JSON.parse(jsonStr);
        
        return result as EvaluationResponse;
    } catch (error) {
        console.error("Error evaluating answer:", error);
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
  try {
    const prompt = `You are an expert learning assistant. A user has practiced a skill and you need to create a revision summary based on their performance.

I will provide you with two lists of questions:
1. Questions they knew or partially knew the answer to.
2. Questions they did not know the answer to or got incorrect.

Your task is to:
- Analyze each list of questions.
- Identify the core concepts or topics being tested in each list.
- Generate a concise summary for each list in markdown bullet points.
- The summary should not just be a list of the questions, but a synthesis of the underlying topics.

Questions the user KNEW:
---
- ${knownQuestions.join('\n- ')}
---

Questions the user DID NOT KNOW:
---
- ${unknownQuestions.join('\n- ')}
---

Return a JSON object with two keys:
- "conceptsKnown": A summary of topics the user is comfortable with (string, markdown formatted).
- "conceptsToReview": A summary of topics the user should focus on for revision (string, markdown formatted).`;

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

    const jsonStr = cleanJsonString(response.text ?? "");
    if (!jsonStr) {
      throw new Error('Received empty summary from API');
    }
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Error generating revision summary:', error);
    return {
      conceptsKnown: 'Could not generate summary due to an error.',
      conceptsToReview: 'Could not generate summary due to an error.',
    };
  }
};
