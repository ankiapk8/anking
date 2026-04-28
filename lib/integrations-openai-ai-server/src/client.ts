import OpenAI from "openai";

const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

if (!apiKey) {
  console.warn("WARNING: Neither AI_INTEGRATIONS_OPENAI_API_KEY nor OPENAI_API_KEY is set.");
}

console.info(`AI client initialized with baseURL: ${baseURL}`);

export const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: baseURL,
});
