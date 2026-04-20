import { GoogleGenAI } from "@google/genai";
import { SculptureParams } from "../types";

const SYSTEM_PROMPT = `
You are a 3D sculpture parameter extractor. Your task is to extract 4 specific parameters from the user's natural language input.
The parameters are:
1. slice_count (integer, 1-100, default 10)
2. length (float, 0.1-20.0, default 5.0)
3. thickness (float, 0.0-2.0, default 0.5)
4. twist_angle (integer, 0-360, default 90)

Return ONLY a valid JSON object with these 4 keys. If a parameter is not mentioned, use the default value.
Example: "I want a 3m long sculpture, twisted 180 degrees, with thin slices around 0.2."
Output: {"slice_count": 10, "length": 3.0, "thickness": 0.2, "twist_angle": 180}
`;

let genAI: any = null;

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  if (!genAI) {
    genAI = new (GoogleGenAI as any)(apiKey);
  }
  return genAI;
}

export async function parseParamsFromText(text: string): Promise<SculptureParams> {
  const ai = getGenAI();
  
  if (!ai) {
    console.warn("GEMINI_API_KEY is missing or invalid, using default params.");
    return { slice_count: 10, length: 5.0, thickness: 0.5, twist_angle: 90 };
  }

  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent([SYSTEM_PROMPT, text]);
    const response = result.response;
    const jsonText = response.text().replace(/```json|```/g, "").trim();
    return JSON.parse(jsonText) as SculptureParams;
  } catch (error) {
    console.error("AI Parsing Error:", error);
    return { slice_count: 10, length: 5.0, thickness: 0.5, twist_angle: 90 };
  }
}
