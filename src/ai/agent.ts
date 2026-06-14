import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, CLAUDE_MODEL } from "./client.ts";
import { getToolDefinitions, handleToolCall } from "./tools.ts";
import { logger } from "../lib/logger.ts";

export interface AgentResult {
  toolResults: Map<string, unknown>;
  textOutput: string;
}

export async function runAgent(prompt: string, systemPrompt?: string): Promise<AgentResult> {
  const client = getAnthropicClient();
  const tools = getToolDefinitions();
  const toolResults = new Map<string, unknown>();
  let textOutput = "";

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: systemPrompt ?? "",
    tools,
    messages,
  });

  for (const block of response.content) {
    if (block.type === "text") {
      textOutput += block.text;
    } else if (block.type === "tool_use") {
      try {
        const result = handleToolCall(block.name, block.input as Record<string, unknown>);
        toolResults.set(block.name, result);
        logger.info(`Agent tool "${block.name}" thực thi OK`);
      } catch (err) {
        logger.error(`Agent tool "${block.name}" lỗi`, err);
      }
    }
  }

  return { toolResults, textOutput };
}
