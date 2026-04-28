import OpenAI from "openai";

const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

if (!apiKey) {
  console.warn("WARNING: Neither AI_INTEGRATIONS_OPENAI_API_KEY nor OPENAI_API_KEY is set.");
} else {
  const isReplitEnv = !!process.env.REPLIT_SLUG;
  const isReplitKey = apiKey.startsWith("replit-ai-");
  const isReplitURL = baseURL.includes("replit");

  if ((isReplitKey || isReplitURL) && !isReplitEnv) {
    console.error("CRITICAL CONFIG ERROR: You are using Replit-specific AI settings on a non-Replit environment (Render).");
    throw new Error(
      "ERROR: Replit AI Integrations only work inside the Replit environment. " +
      "Since you are on Render, you MUST provide a standard OpenAI API key (sk-...) " +
      "in the OPENAI_API_KEY environment variable and leave OPENAI_BASE_URL empty (it defaults to OpenAI)."
    );
  }
  const maskedKey = apiKey.slice(0, 7) + "..." + apiKey.slice(-4);
  console.info(`AI client initialized with baseURL: ${baseURL} and apiKey: ${maskedKey}`);
}

export const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: baseURL,
});
