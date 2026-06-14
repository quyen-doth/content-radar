import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "../config.ts";

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cached) return cached;
  cached = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  return cached;
}

export const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
