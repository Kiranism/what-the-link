import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@bookmark/env/server";

let genAI: GoogleGenerativeAI | null = null;

export function getClient(): GoogleGenerativeAI | null {
  if (!env.GEMINI_API_KEY) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }
  return genAI;
}

export function isGeminiConfigured(): boolean {
  return !!env.GEMINI_API_KEY;
}
