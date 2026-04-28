import OpenAI from "openai";

const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

if (!apiKey) {
  console.warn("WARNING: Neither AI_INTEGRATIONS_OPENAI_API_KEY nor OPENAI_API_KEY is set.");
} else {
  // Clear error if using Replit-only tokens outside of Replit
  if (apiKey.startsWith("replit-ai-") && !process.env.REPLIT_SLUG) {
    throw new Error(
      "ERROR: You are using a Replit AI token on a non-Replit environment (Render). " +
      "These tokens only work inside Replit. Please use a standard OpenAI API key (sk-...) " +
      "and ensure the OPENAI_API_KEY environment variable is set in your Render dashboard."
    );
  }
  const maskedKey = apiKey.slice(0, 7) + "..." + apiKey.slice(-4);
  console.info(`AI client initialized with baseURL: ${baseURL} and apiKey: ${maskedKey}`);
}

export const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: baseURL,
});
