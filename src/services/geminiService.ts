import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini AI client
// Note: In a real production app, you should proxy these requests through a backend 
// to avoid exposing the API key on the client.
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateMessageDraft = async (
  teacherName: string,
  teacherContext: string,
  lastMessage: string
): Promise<string> => {
  if (!apiKey) return "API Key missing. Please configure VITE_GEMINI_API_KEY in .env file.";

  try {
    const model = 'gemini-2.5-flash';
    const prompt = `
      You are a helpful support agent for Clazz.lk, an online teaching platform.
      Draft a short, professional, and friendly WhatsApp reply to a teacher.
      
      Teacher Name: ${teacherName}
      Context/Notes: ${teacherContext}
      Last Message Received: "${lastMessage}"
      
      Keep it under 50 words. Do not include placeholders like [Your Name].
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text || "Could not generate draft.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error generating draft. Please try again.";
  }
};

export const generateBroadcastTemplate = async (
  topic: string,
  audience: string
): Promise<string> => {
  if (!apiKey) return "API Key missing.";

  try {
    const model = 'gemini-2.5-flash';
    const prompt = `
      Create a WhatsApp marketing message template for Clazz.lk teachers.
      Topic: ${topic}
      Target Audience: ${audience}
      
      Use {{name}} as the variable for the teacher's name.
      Include emojis to make it engaging.
      Keep it clear and actionable.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text || "Could not generate template.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error generating template.";
  }
};
